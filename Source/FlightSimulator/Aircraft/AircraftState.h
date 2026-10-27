#pragma once

#include "CoreMinimal.h"
#include "AircraftState.generated.h"

UENUM(BlueprintType)
enum class EAircraftGearState : uint8
{
    Down UMETA(DisplayName = "Down"),
    Transitioning UMETA(DisplayName = "Transitioning"),
    Up UMETA(DisplayName = "Up")
};

UENUM(BlueprintType)
enum class EAircraftEngineState : uint8
{
    Off UMETA(DisplayName = "Off"),
    Starting UMETA(DisplayName = "Starting"),
    Running UMETA(DisplayName = "Running"),
    Afterburner UMETA(DisplayName = "Afterburner"),
    Flameout UMETA(DisplayName = "Flameout")
};

/**
 * FAircraftState
 *
 * Central telemetry state structure populated every physics tick by UAircraftFlightPhysics.
 * All instruments, HUD widgets, audio components, and debug overlays read directly from this struct.
 */
USTRUCT(BlueprintType)
struct FLIGHTSIMULATOR_API FAircraftState
{
    GENERATED_BODY()

    /** Indicated/True Airspeed (m/s) */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Flight State")
    float AirspeedMS = 0.0f;

    /** Airspeed in Knots */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Flight State")
    float AirspeedKnots = 0.0f;

    /** Ground speed in Knots */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Flight State")
    float GroundSpeedKnots = 0.0f;

    /** Altitude above Mean Sea Level (meters) */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Flight State")
    float AltitudeMeters = 0.0f;

    /** Altitude above Mean Sea Level (feet) */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Flight State")
    float AltitudeFeet = 0.0f;

    /** Altitude above ground level via radar altimeter trace (meters) */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Flight State")
    float RadarAltitudeAGLMeters = 0.0f;

    /** Vertical climb/descent rate (m/s) */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Flight State")
    float VerticalSpeedMS = 0.0f;

    /** Vertical climb/descent rate (feet per minute) */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Flight State")
    float VerticalSpeedFpm = 0.0f;

    /** Magnetic/True Compass Heading [0..360 deg) */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Flight State")
    float HeadingDeg = 0.0f;

    /** Pitch attitude angle (degrees, + nose up) */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Flight State")
    float PitchDeg = 0.0f;

    /** Roll bank angle (degrees, + right wing down) */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Flight State")
    float RollDeg = 0.0f;

    /** Yaw angle (degrees) */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Flight State")
    float YawDeg = 0.0f;

    /** Angle of Attack alpha between relative airflow and wing chord (degrees) */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Aerodynamics")
    float AngleOfAttackDeg = 0.0f;

    /** Sideslip angle beta (degrees) */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Aerodynamics")
    float SideslipDeg = 0.0f;

    /** Pilot throttle command [0.0 .. 1.0] */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Propulsion")
    float Throttle = 0.0f;

    /** Actual turbine spool ratio [0.0 .. 1.0] */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Propulsion")
    float EngineSpoolRatio = 0.0f;

    /** Instantaneous net engine thrust force (Newtons) */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Propulsion")
    float EngineThrustN = 0.0f;

    /** Remaining internal fuel mass (kg) */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Propulsion")
    float FuelKg = 3175.0f;

    /** Instantaneous aerodynamic Lift force magnitude (Newtons) */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Forces")
    float LiftForceN = 0.0f;

    /** Instantaneous aerodynamic Drag force magnitude (Newtons) */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Forces")
    float DragForceN = 0.0f;

    /** Instantaneous Gravity / Weight force magnitude (Newtons) */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Forces")
    float GravityForceN = 0.0f;

    /** Normal load factor felt by the airframe/pilot (G) */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Forces")
    float GForce = 1.0f;

    /** Current ambient air density (kg/m^3) */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Atmosphere")
    float AirDensityKgM3 = 1.225f;

    /** Current dynamic pressure q = 0.5 * rho * V^2 (Pascals) */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Atmosphere")
    float DynamicPressurePa = 0.0f;

    /** Flaps deployment ratio [0.0 .. 1.0] */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Controls & Systems")
    float FlapsPosition = 0.0f;

    /** Airbrake / spoiler deployment ratio [0.0 .. 1.0] */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Controls & Systems")
    float AirbrakePosition = 0.0f;

    /** Landing gear state */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Controls & Systems")
    EAircraftGearState GearState = EAircraftGearState::Down;

    /** Wheel brakes active state */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Controls & Systems")
    bool bBrakeState = true;

    /** Aerodynamic stall warning/active state */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Controls & Systems")
    bool bStallState = false;

    /** Whether landing gear wheels have weight on ground */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Controls & Systems")
    bool bIsOnGround = true;

    /** Current engine operating state */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Propulsion")
    EAircraftEngineState EngineState = EAircraftEngineState::Running;

    /** World-space 3D force vectors (Newtons) for debug visualization */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Debug Vectors")
    FVector ForceLiftWorld = FVector::ZeroVector;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Debug Vectors")
    FVector ForceDragWorld = FVector::ZeroVector;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Debug Vectors")
    FVector ForceThrustWorld = FVector::ZeroVector;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Debug Vectors")
    FVector ForceGravityWorld = FVector::ZeroVector;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Debug Vectors")
    FVector NetTorqueBodyNm = FVector::ZeroVector;
};
