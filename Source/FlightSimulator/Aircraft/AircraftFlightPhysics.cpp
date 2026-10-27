#include "Aircraft/AircraftFlightPhysics.h"
#include "FlightModel/Aerodynamics.h"
#include "FlightModel/EngineModel.h"
#include "DrawDebugHelpers.h"
#include "Engine/Engine.h"
#include "Engine/World.h"

UAircraftFlightPhysics::UAircraftFlightPhysics()
{
    PrimaryComponentTick.bCanEverTick = true;
    PrimaryComponentTick.TickGroup = TG_PrePhysics;
}

void UAircraftFlightPhysics::BeginPlay()
{
    Super::BeginPlay();

    if (!AircraftConfig)
    {
        AircraftConfig = NewObject<UAircraftConfig>(this);
    }

    CurrentState.FuelKg = AircraftConfig->MaxFuelKg;
    CurrentState.GearState = EAircraftGearState::Down;
    CurrentState.EngineState = EAircraftEngineState::Running;
}

void UAircraftFlightPhysics::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
    Super::TickComponent(DeltaTime, TickType, ThisTickFunction);

    if (DeltaTime <= 0.0f || !GetOwner() || !AircraftConfig)
    {
        return;
    }

    const float ClampedFrameDt = FMath::Min(DeltaTime, 0.1f);
    const int32 NumSubsteps = FMath::Clamp(FMath::CeilToInt(ClampedFrameDt / MaxPhysicsSubstepDeltaTime), 1, 8);
    const float SubstepDt = ClampedFrameDt / static_cast<float>(NumSubsteps);

    for (int32 i = 0; i < NumSubsteps; ++i)
    {
        StepPhysicsSubstep(SubstepDt);
    }

    if (bDrawForceVectors)
    {
        DrawDebugForceVectors();
    }

    if (bShowDebugTelemetryOverlay)
    {
        DrawDebugOverlay(DeltaTime);
    }
}

void UAircraftFlightPhysics::StepPhysicsSubstep(float SubstepDt)
{
    AActor* Owner = GetOwner();
    FTransform Transform = Owner->GetActorTransform();

    // 1. Update Mechanical Control Surface & Gear Actuators
    CurrentState.FlapsPosition = FMath::FInterpConstantTo(CurrentState.FlapsPosition, TargetFlapsPosition, SubstepDt, 0.35f);
    CurrentState.AirbrakePosition = FMath::FInterpConstantTo(CurrentState.AirbrakePosition, TargetAirbrakePosition, SubstepDt, 0.80f);
    GearDeployRatio = FMath::FInterpConstantTo(GearDeployRatio, bGearCommandedDown ? 1.0f : 0.0f, SubstepDt, 0.25f);
    CurrentState.GearState = (GearDeployRatio > 0.98f) ? EAircraftGearState::Down :
                             (GearDeployRatio < 0.02f) ? EAircraftGearState::Up :
                                                         EAircraftGearState::Transitioning;

    // 2. Update Engine Spool & Fuel Mass
    const bool bHasFuel = CurrentState.FuelKg > 0.1f;
    CurrentState.Throttle = ThrottleInput;
    CurrentState.EngineSpoolRatio = FEngineModel::UpdateEngineSpool(
        CurrentState.EngineSpoolRatio,
        ThrottleInput,
        bHasFuel,
        SubstepDt,
        AircraftConfig
    );

    const float GrossMassKg = AircraftConfig->EmptyMassKg + CurrentState.FuelKg;

    // 3. Altitude & Ground Contact Trace (Unreal units are centimeters: 100 UU = 1 meter)
    const float AltitudeMeters = FMath::Max(0.0f, Transform.GetLocation().Z * 0.01f);
    FVector GroundNormal = FVector::UpVector;
    const float HeightAGLMeters = TraceGroundDistanceMeters(GroundNormal);
    const bool bTouchingGround = (HeightAGLMeters <= 0.12f);

    // 4. Update Weather / Wind & Turbulence
    FVector WindVelMS = FVector::ZeroVector;
    FVector TurbulenceTorqueNm = FVector::ZeroVector;
    if (WindSystem)
    {
        WindSystem->UpdateWind(SubstepDt, AltitudeMeters, VelocityWorldMS.Size());
        WindVelMS = WindSystem->GetCurrentWindVelocityMS();
        TurbulenceTorqueNm = WindSystem->GetCurrentTurbulenceTorqueNm();
    }

    // 5. Evaluate 6-DOF Aerodynamic Forces & Moments
    const FAerodynamicSolution Aero = FAerodynamics::EvaluateSixDof(
        VelocityWorldMS,
        WindVelMS,
        Transform,
        BodyAngularVelocityRadSec,
        ElevatorInput,
        AileronInput,
        RudderInput,
        AltitudeMeters,
        HeightAGLMeters,
        CurrentState.EngineSpoolRatio,
        bAfterburnerActive,
        CurrentState.FlapsPosition,
        CurrentState.AirbrakePosition,
        GearDeployRatio,
        bTouchingGround,
        bHasFuel,
        GrossMassKg,
        AircraftConfig
    );

    // Burn Fuel
    CurrentState.FuelKg = FMath::Max(0.0f, CurrentState.FuelKg - FEngineModel::CalculateFuelBurnKg(Aero.ThrustMagnitudeN, bAfterburnerActive, SubstepDt));
    CurrentState.EngineState = !bHasFuel ? EAircraftEngineState::Flameout :
                               (bAfterburnerActive && CurrentState.EngineSpoolRatio > 0.85f) ? EAircraftEngineState::Afterburner :
                               EAircraftEngineState::Running;

    FVector NetForceWorldN = Aero.NetForceWorldN;
    FVector NetTorqueBodyNm = Aero.NetTorqueBodyNm + TurbulenceTorqueNm;

    // 6. Runway Ground Reaction, Wheel Rolling Friction, Braking & Nosewheel Steering
    const bool bLiftingOff = (Aero.LiftMagnitudeN >= Aero.GravityMagnitudeN * 0.98f) && (Transform.GetRotation().Rotator().Pitch > 1.0f);
    if (bTouchingGround && !bLiftingOff)
    {
        CurrentState.bIsOnGround = true;

        // Normal force cancels downward sink into runway
        const float VerticalForceN = NetForceWorldN.Z;
        const float NormalForceN = FMath::Max(0.0f, -VerticalForceN);
        if (NetForceWorldN.Z < 0.0f)
        {
            NetForceWorldN.Z = 0.0f;
        }
        if (VelocityWorldMS.Z < 0.0f)
        {
            VelocityWorldMS.Z = 0.0f;
        }

        // Rolling resistance + wheel brake friction
        const float GroundSpeedMS = FVector(VelocityWorldMS.X, VelocityWorldMS.Y, 0.0f).Size();
        const float FrictionCoeff = 0.022f + (bWheelBrakesActive ? 0.42f : 0.0f);
        const float MaxBrakeForceN = FrictionCoeff * NormalForceN;

        if (GroundSpeedMS > 0.05f)
        {
            const FVector GroundDir = FVector(VelocityWorldMS.X, VelocityWorldMS.Y, 0.0f).GetSafeNormal();
            const float AppliedFrictionN = FMath::Min(MaxBrakeForceN, (GroundSpeedMS * GrossMassKg) / SubstepDt);
            NetForceWorldN -= GroundDir * AppliedFrictionN;
        }
        else if (bWheelBrakesActive || ThrottleInput < 0.02f)
        {
            VelocityWorldMS.X = 0.0f;
            VelocityWorldMS.Y = 0.0f;
        }

        // Nosewheel steering torque & main-gear rotation authority on runway
        const float SteerAuthority = FMath::Clamp((GroundSpeedMS * 1.94384f) / 25.0f, 0.15f, 1.0f);
        BodyAngularVelocityRadSec.X = 0.0f; // Roll constrained by main gear struts
        BodyAngularVelocityRadSec.Z = RudderInput * 0.65f * SteerAuthority;
    }
    else
    {
        CurrentState.bIsOnGround = false;
    }

    // 7. Symplectic Euler Integration of Linear Acceleration & Velocity (a = F / m)
    const FVector LinearAccelMS2 = NetForceWorldN / GrossMassKg;
    VelocityWorldMS += LinearAccelMS2 * SubstepDt;

    // Convert m/s to Unreal cm/s for Actor translation
    const FVector DeltaLocationCm = VelocityWorldMS * 100.0f * SubstepDt;
    Owner->AddActorWorldOffset(DeltaLocationCm, true);

    // 8. Integrate Rotational Torque & Moment of Inertia (alpha = I^-1 * Torque)
    const FVector Inertia = AircraftConfig->MomentOfInertiaKgM2;
    const FVector AngularAccelRadSec2(
        NetTorqueBodyNm.X / FMath::Max(100.0f, Inertia.X),
        NetTorqueBodyNm.Y / FMath::Max(100.0f, Inertia.Y),
        NetTorqueBodyNm.Z / FMath::Max(100.0f, Inertia.Z)
    );

    BodyAngularVelocityRadSec += AngularAccelRadSec2 * SubstepDt;

    // Apply local rotation delta quaternion
    const FVector DeltaAnglesRad = BodyAngularVelocityRadSec * SubstepDt;
    const FQuat DeltaQuat = FQuat(FVector::ForwardVector, DeltaAnglesRad.X) *
                            FQuat(FVector::RightVector, DeltaAnglesRad.Y) *
                            FQuat(FVector::UpVector, DeltaAnglesRad.Z);
    Owner->AddActorLocalRotation(DeltaQuat, false);

    // 9. Populate Central FAircraftState Snapshot for HUD & Instruments
    const FRotator Rot = Owner->GetActorRotation();
    CurrentState.AirspeedMS = Aero.TrueAirspeedMS;
    CurrentState.AirspeedKnots = Aero.TrueAirspeedMS * 1.94384f;
    CurrentState.GroundSpeedKnots = FVector(VelocityWorldMS.X, VelocityWorldMS.Y, 0.0f).Size() * 1.94384f;
    CurrentState.AltitudeMeters = AltitudeMeters;
    CurrentState.AltitudeFeet = AltitudeMeters * 3.28084f;
    CurrentState.RadarAltitudeAGLMeters = HeightAGLMeters;
    CurrentState.VerticalSpeedMS = VelocityWorldMS.Z;
    CurrentState.VerticalSpeedFpm = VelocityWorldMS.Z * 3.28084f * 60.0f;
    CurrentState.PitchDeg = Rot.Pitch;
    CurrentState.RollDeg = Rot.Roll;
    CurrentState.YawDeg = FMath::Fmod(Rot.Yaw + 360.0f, 360.0f);
    CurrentState.HeadingDeg = CurrentState.YawDeg;
    CurrentState.AngleOfAttackDeg = Aero.AngleOfAttackDeg;
    CurrentState.SideslipDeg = Aero.SideslipDeg;
    CurrentState.EngineThrustN = Aero.ThrustMagnitudeN;
    CurrentState.LiftForceN = Aero.LiftMagnitudeN;
    CurrentState.DragForceN = Aero.DragMagnitudeN;
    CurrentState.GravityForceN = Aero.GravityMagnitudeN;
    CurrentState.AirDensityKgM3 = Aero.AirDensityKgM3;
    CurrentState.DynamicPressurePa = Aero.DynamicPressurePa;
    CurrentState.bBrakeState = bWheelBrakesActive;
    CurrentState.bStallState = Aero.bIsStalling;

    const FVector UpVec = Owner->GetActorUpVector();
    const float NormalAccel = FVector::DotProduct(Aero.ForceLiftWorldN + Aero.ForceThrustWorldN, UpVec) / GrossMassKg;
    CurrentState.GForce = NormalAccel / 9.81f;

    CurrentState.ForceLiftWorld = Aero.ForceLiftWorldN;
    CurrentState.ForceDragWorld = Aero.ForceDragWorldN;
    CurrentState.ForceThrustWorld = Aero.ForceThrustWorldN;
    CurrentState.ForceGravityWorld = Aero.ForceGravityWorldN;
    CurrentState.NetTorqueBodyNm = NetTorqueBodyNm;
}

float UAircraftFlightPhysics::TraceGroundDistanceMeters(FVector& OutGroundNormal) const
{
    const AActor* Owner = GetOwner();
    if (!Owner || !GetWorld())
    {
        return 1000.0f;
    }

    const FVector Start = Owner->GetActorLocation();
    const FVector End = Start - FVector(0.0f, 0.0f, 500000.0f); // 5 km radar altimeter trace
    FHitResult Hit;
    FCollisionQueryParams Params;
    Params.AddIgnoredActor(Owner);

    if (GetWorld()->LineTraceSingleByChannel(Hit, Start, End, ECC_Visibility, Params))
    {
        OutGroundNormal = Hit.ImpactNormal;
        return FMath::Max(0.0f, (Hit.Distance - 180.0f) * 0.01f); // Subtract 1.8m gear strut height
    }
    return FMath::Max(0.0f, Start.Z * 0.01f);
}

void UAircraftFlightPhysics::DrawDebugForceVectors() const
{
    const AActor* Owner = GetOwner();
    if (!Owner || !GetWorld())
    {
        return;
    }

    const FVector Origin = Owner->GetActorLocation();
    const float ScaleCmPerNewton = 1000.0f / FMath::Max(1000.0f, CurrentState.GravityForceN);

    // Lift Vector (Green)
    DrawDebugDirectionalArrow(GetWorld(), Origin, Origin + CurrentState.ForceLiftWorld * ScaleCmPerNewton, 45.0f, FColor::Green, false, -1.0f, 0, 4.0f);
    // Drag Vector (Red)
    DrawDebugDirectionalArrow(GetWorld(), Origin, Origin + CurrentState.ForceDragWorld * ScaleCmPerNewton, 45.0f, FColor::Red, false, -1.0f, 0, 4.0f);
    // Thrust Vector (Cyan)
    DrawDebugDirectionalArrow(GetWorld(), Origin, Origin + CurrentState.ForceThrustWorld * ScaleCmPerNewton, 45.0f, FColor::Cyan, false, -1.0f, 0, 4.0f);
    // Gravity Vector (Yellow)
    DrawDebugDirectionalArrow(GetWorld(), Origin, Origin + CurrentState.ForceGravityWorld * ScaleCmPerNewton, 45.0f, FColor::Yellow, false, -1.0f, 0, 4.0f);
}

void UAircraftFlightPhysics::DrawDebugOverlay(float DeltaTime) const
{
    if (!GEngine)
    {
        return;
    }

    const float FPS = (DeltaTime > 0.0f) ? (1.0f / DeltaTime) : 0.0f;
    const FString DebugMsg = FString::Printf(
        TEXT("[PHASE 1 FLIGHT PHYSICS DEBUG]\n")
        TEXT("FPS: %.0f | Stall: %s | Gear: %d | Flaps: %.0f%%\n")
        TEXT("Airspeed: %.1f kts (%.1f m/s) | Alt: %.0f ft (%.1f m) | VSI: %+.0f FPM\n")
        TEXT("Pitch: %+.1f deg | Roll: %+.1f deg | Yaw: %05.1f deg | AoA: %+.2f deg\n")
        TEXT("Lift: %.0f N | Drag: %.0f N | Thrust: %.0f N | Gravity: %.0f N | Throttle: %.0f%%"),
        FPS,
        CurrentState.bStallState ? TEXT("WARNING!") : TEXT("NORMAL"),
        static_cast<int32>(CurrentState.GearState),
        CurrentState.FlapsPosition * 100.0f,
        CurrentState.AirspeedKnots, CurrentState.AirspeedMS,
        CurrentState.AltitudeFeet, CurrentState.AltitudeMeters,
        CurrentState.VerticalSpeedFpm,
        CurrentState.PitchDeg, CurrentState.RollDeg, CurrentState.YawDeg, CurrentState.AngleOfAttackDeg,
        CurrentState.LiftForceN, CurrentState.DragForceN, CurrentState.EngineThrustN, CurrentState.GravityForceN,
        CurrentState.Throttle * 100.0f
    );

    GEngine->AddOnScreenDebugMessage(1001, 0.0f, CurrentState.bStallState ? FColor::Red : FColor::Cyan, DebugMsg);
}

void UAircraftFlightPhysics::SetThrottleInput(float InThrottle) { ThrottleInput = FMath::Clamp(InThrottle, 0.0f, 1.0f); }
void UAircraftFlightPhysics::SetElevatorInput(float InElevator) { ElevatorInput = FMath::Clamp(InElevator, -1.0f, 1.0f); }
void UAircraftFlightPhysics::SetAileronInput(float InAileron) { AileronInput = FMath::Clamp(InAileron, -1.0f, 1.0f); }
void UAircraftFlightPhysics::SetRudderInput(float InRudder) { RudderInput = FMath::Clamp(InRudder, -1.0f, 1.0f); }
void UAircraftFlightPhysics::SetFlapsTarget(float InFlapsRatio) { TargetFlapsPosition = FMath::Clamp(InFlapsRatio, 0.0f, 1.0f); }
void UAircraftFlightPhysics::SetAirbrakeTarget(float InAirbrakeRatio) { TargetAirbrakePosition = FMath::Clamp(InAirbrakeRatio, 0.0f, 1.0f); }
void UAircraftFlightPhysics::ToggleLandingGear() { bGearCommandedDown = !bGearCommandedDown; }
void UAircraftFlightPhysics::SetWheelBrakes(bool bEnabled) { bWheelBrakesActive = bEnabled; }
void UAircraftFlightPhysics::SetAfterburner(bool bEnabled) { bAfterburnerActive = bEnabled; }
