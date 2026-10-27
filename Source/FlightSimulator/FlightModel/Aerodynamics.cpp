#include "FlightModel/Aerodynamics.h"
#include "FlightModel/LiftModel.h"
#include "FlightModel/DragModel.h"
#include "FlightModel/EngineModel.h"

FAerodynamicSolution FAerodynamics::EvaluateSixDof(
    const FVector& WorldVelocityMS,
    const FVector& WindVelocityMS,
    const FTransform& AircraftTransform,
    const FVector& BodyAngularVelocityRadSec,
    float ElevatorInput,
    float AileronInput,
    float RudderInput,
    float AltitudeMeters,
    float HeightAGLMeters,
    float EngineSpoolRatio,
    bool bAfterburnerActive,
    float FlapsPosition,
    float AirbrakePosition,
    float GearDownRatio,
    bool bIsOnGround,
    bool bHasFuel,
    float CurrentGrossMassKg,
    const UAircraftConfig* Config)
{
    FAerodynamicSolution Out;
    if (!Config)
    {
        return Out;
    }

    const FVector ForwardVec = AircraftTransform.GetUnitAxis(EAxis::X);
    const FVector RightVec = AircraftTransform.GetUnitAxis(EAxis::Y);
    const FVector UpVec = AircraftTransform.GetUnitAxis(EAxis::Z);

    // 1. Relative Airspeed Vector (Accounting for 3D Wind & Gusts)
    const FVector RelAirVelMS = WorldVelocityMS - WindVelocityMS;
    Out.TrueAirspeedMS = RelAirVelMS.Size();
    Out.AirDensityKgM3 = FLiftModel::CalculateAirDensity(AltitudeMeters);
    Out.DynamicPressurePa = 0.5f * Out.AirDensityKgM3 * FMath::Square(Out.TrueAirspeedMS);

    // 2. Transform Relative Velocity into Body Frame (u = forward, v = right, w = up)
    const float UForward = FVector::DotProduct(RelAirVelMS, ForwardVec);
    const float VRight = FVector::DotProduct(RelAirVelMS, RightVec);
    const float WUp = FVector::DotProduct(RelAirVelMS, UpVec);

    if (Out.TrueAirspeedMS > 0.5f)
    {
        // Positive AoA when airflow strikes the underside of the wing (WUp < 0 relative to aircraft)
        const float AlphaRad = -FMath::Atan2(WUp, FMath::Max(0.2f, FMath::Abs(UForward)));
        const float BetaRad = FMath::Atan2(VRight, FMath::Max(0.2f, FMath::Abs(UForward)));
        Out.AngleOfAttackDeg = FMath::RadiansToDegrees(AlphaRad);
        Out.SideslipDeg = FMath::RadiansToDegrees(BetaRad);
    }

    // 3. Lift and Drag Evaluation
    Out.CL = FLiftModel::CalculateLiftCoefficient(
        Out.AngleOfAttackDeg,
        FlapsPosition,
        AirbrakePosition,
        bIsOnGround,
        HeightAGLMeters,
        Config
    );

    Out.CD = FDragModel::CalculateDragCoefficient(
        Out.CL,
        Out.AngleOfAttackDeg,
        Out.SideslipDeg,
        FlapsPosition,
        AirbrakePosition,
        GearDownRatio,
        HeightAGLMeters,
        Config
    );

    Out.LiftMagnitudeN = FLiftModel::CalculateLiftForce(Out.DynamicPressurePa, Config->WingAreaM2, Out.CL);
    Out.DragMagnitudeN = FDragModel::CalculateDragForce(Out.DynamicPressurePa, Config->WingAreaM2, Out.CD);

    const FVector AirDir = (Out.TrueAirspeedMS > 0.3f) ? (RelAirVelMS / Out.TrueAirspeedMS) : ForwardVec;

    // Lift is perpendicular to relative wind and aircraft right wing axis
    const FVector LiftDir = FVector::CrossProduct(AirDir, RightVec).GetSafeNormal();
    Out.ForceLiftWorldN = LiftDir * Out.LiftMagnitudeN;

    // Drag opposes relative wind vector
    Out.ForceDragWorldN = -AirDir * Out.DragMagnitudeN;

    // Side force from sideslip
    const float BetaRad = FMath::DegreesToRadians(Out.SideslipDeg);
    const float CY = -0.60f * BetaRad + 0.10f * RudderInput;
    Out.ForceSideWorldN = RightVec * (Out.DynamicPressurePa * Config->WingAreaM2 * CY);

    // Thrust along aircraft longitudinal X axis
    Out.ThrustMagnitudeN = FEngineModel::CalculateThrustMagnitude(
        EngineSpoolRatio,
        bAfterburnerActive,
        Out.AirDensityKgM3,
        Out.TrueAirspeedMS,
        bHasFuel,
        Config
    );
    Out.ForceThrustWorldN = ForwardVec * Out.ThrustMagnitudeN;

    // Gravity always acts straight down (-Z in Unreal world coordinates)
    Out.GravityMagnitudeN = CurrentGrossMassKg * 9.81f;
    Out.ForceGravityWorldN = FVector(0.0f, 0.0f, -Out.GravityMagnitudeN);

    Out.NetForceWorldN = Out.ForceThrustWorldN + Out.ForceLiftWorldN + Out.ForceDragWorldN + Out.ForceSideWorldN + Out.ForceGravityWorldN;
    Out.bIsStalling = (FMath::Abs(Out.AngleOfAttackDeg) > Config->StallAngleDeg) && (Out.TrueAirspeedMS * 1.94384f > 25.0f) && !bIsOnGround;

    // 4. Aerodynamic Torques / Moments in Body Frame (Roll = X, Pitch = Y, Yaw = Z)
    const float QEff = FMath::Clamp(Out.DynamicPressurePa, 80.0f, 18000.0f);
    const float FBWGain = FMath::Clamp(3500.0f / FMath::Max(3500.0f, Out.DynamicPressurePa), 0.22f, 1.0f);
    const float SafeSpeed = FMath::Max(15.0f, Out.TrueAirspeedMS);
    const float AlphaRad = FMath::DegreesToRadians(Out.AngleOfAttackDeg);

    const float RollRateP = BodyAngularVelocityRadSec.X;
    const float PitchRateQ = BodyAngularVelocityRadSec.Y;
    const float YawRateR = BodyAngularVelocityRadSec.Z;

    // Roll Moment L (around Body +X)
    const float ClControl = Config->AileronEffectiveness * AileronInput * FBWGain;
    const float ClDihedral = Config->DihedralStabilityClBeta * BetaRad;
    const float ClDamping = -1.65f * (RollRateP * Config->WingspanM / (2.0f * SafeSpeed));
    const float RollMomentNm = QEff * Config->WingAreaM2 * Config->WingspanM * (ClControl + ClDihedral + ClDamping);

    // Pitch Moment M (around Body +Y)
    const float CmControl = Config->ElevatorEffectiveness * ElevatorInput * FBWGain;
    const float CmStability = Config->LongitudinalStabilityCmAlpha * AlphaRad;
    const float CmDamping = -14.0f * (PitchRateQ * Config->MeanChordM / (2.0f * SafeSpeed));
    const float CmStallDrop = Out.bIsStalling ? -0.45f : 0.0f;
    const float PitchMomentNm = QEff * Config->WingAreaM2 * Config->MeanChordM * (CmControl + CmStability + CmDamping + CmStallDrop);

    // Yaw Moment N (around Body +Z)
    const float CnControl = Config->RudderEffectiveness * RudderInput * FBWGain;
    const float CnWeathercock = Config->DirectionalStabilityCnBeta * BetaRad;
    const float CnDamping = -1.25f * (YawRateR * Config->WingspanM / (2.0f * SafeSpeed));
    const float YawMomentNm = QEff * Config->WingAreaM2 * Config->WingspanM * (CnControl + CnWeathercock + CnDamping);

    Out.NetTorqueBodyNm = FVector(RollMomentNm, PitchMomentNm, YawMomentNm);
    return Out;
}
