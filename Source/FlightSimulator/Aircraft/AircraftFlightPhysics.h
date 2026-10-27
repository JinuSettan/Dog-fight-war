#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "Aircraft/AircraftConfig.h"
#include "Aircraft/AircraftState.h"
#include "Weather/WindSystem.h"
#include "AircraftFlightPhysics.generated.h"

/**
 * UAircraftFlightPhysics
 *
 * Reusable 6-DOF physics-based flight simulation component for Unreal Engine 5.x.
 * Integrates linear forces (Thrust, Lift, Drag, SideForce, Gravity, Runway Gear Normal/Friction)
 * and rotational torques (Elevator, Aileron, Rudder, Weathercock Stability, Stall Pitch-Down,
 * Damping, and Turbulence) with configurable sub-stepping for mobile 60/120 FPS stability.
 */
UCLASS(ClassGroup = (FlightSimulator), meta = (BlueprintSpawnableComponent))
class FLIGHTSIMULATOR_API UAircraftFlightPhysics : public UActorComponent
{
    GENERATED_BODY()

public:
    UAircraftFlightPhysics();

    virtual void BeginPlay() override;
    virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

    /** Aircraft aerodynamic & physical configuration DataAsset */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Flight Physics|Config")
    TObjectPtr<UAircraftConfig> AircraftConfig;

    /** Optional reference to the Wind & Turbulence component */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Flight Physics|Weather")
    TObjectPtr<UWindSystem> WindSystem;

    /** Maximum physics substep delta time (seconds) for numerical stability on mobile */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Flight Physics|Optimization", meta = (ClampMin = "0.004", ClampMax = "0.033"))
    float MaxPhysicsSubstepDeltaTime = 0.00833f; // 120 Hz internal substep

    /** Developer debug toggle to draw 3D Force Vectors around the aircraft */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Flight Physics|Debug")
    bool bDrawForceVectors = true;

    /** Developer debug toggle to print live Phase 1 telemetry overlay */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Flight Physics|Debug")
    bool bShowDebugTelemetryOverlay = true;

    // --- Pilot Control Surface & System Inputs ---
    UFUNCTION(BlueprintCallable, Category = "Flight Physics|Controls")
    void SetThrottleInput(float InThrottle);

    UFUNCTION(BlueprintCallable, Category = "Flight Physics|Controls")
    void SetElevatorInput(float InElevator);

    UFUNCTION(BlueprintCallable, Category = "Flight Physics|Controls")
    void SetAileronInput(float InAileron);

    UFUNCTION(BlueprintCallable, Category = "Flight Physics|Controls")
    void SetRudderInput(float InRudder);

    UFUNCTION(BlueprintCallable, Category = "Flight Physics|Controls")
    void SetFlapsTarget(float InFlapsRatio);

    UFUNCTION(BlueprintCallable, Category = "Flight Physics|Controls")
    void SetAirbrakeTarget(float InAirbrakeRatio);

    UFUNCTION(BlueprintCallable, Category = "Flight Physics|Controls")
    void ToggleLandingGear();

    UFUNCTION(BlueprintCallable, Category = "Flight Physics|Controls")
    void SetWheelBrakes(bool bEnabled);

    UFUNCTION(BlueprintCallable, Category = "Flight Physics|Controls")
    void SetAfterburner(bool bEnabled);

    /** Returns the central FAircraftState telemetry snapshot for HUD & instruments */
    UFUNCTION(BlueprintPure, Category = "Flight Physics|State")
    const FAircraftState& GetAircraftState() const { return CurrentState; }

private:
    void StepPhysicsSubstep(float SubstepDt);
    float TraceGroundDistanceMeters(FVector& OutGroundNormal) const;
    void DrawDebugForceVectors() const;
    void DrawDebugOverlay(float DeltaTime) const;

    UPROPERTY(VisibleAnywhere, Category = "Flight Physics|State")
    FAircraftState CurrentState;

    // Internal 6-DOF Kinematic State (in meters and radians)
    FVector VelocityWorldMS = FVector::ZeroVector;
    FVector BodyAngularVelocityRadSec = FVector::ZeroVector;

    // Control Target Inputs
    float ThrottleInput = 0.0f;
    float ElevatorInput = 0.0f;
    float AileronInput = 0.0f;
    float RudderInput = 0.0f;
    float TargetFlapsPosition = 0.0f;
    float TargetAirbrakePosition = 0.0f;
    float GearDeployRatio = 1.0f;
    bool bGearCommandedDown = true;
    bool bWheelBrakesActive = false;
    bool bAfterburnerActive = false;
};
