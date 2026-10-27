#pragma once

#include "CoreMinimal.h"
#include "Aircraft/AircraftConfig.h"

struct FAerodynamicSolution
{
    FVector ForceLiftWorldN = FVector::ZeroVector;
    FVector ForceDragWorldN = FVector::ZeroVector;
    FVector ForceSideWorldN = FVector::ZeroVector;
    FVector ForceThrustWorldN = FVector::ZeroVector;
    FVector ForceGravityWorldN = FVector::ZeroVector;
    FVector NetForceWorldN = FVector::ZeroVector;

    /** Aerodynamic & Control Moments in Aircraft Body Frame (X=Roll, Y=Pitch, Z=Yaw) in N*m */
    FVector NetTorqueBodyNm = FVector::ZeroVector;

    float LiftMagnitudeN = 0.0f;
    float DragMagnitudeN = 0.0f;
    float ThrustMagnitudeN = 0.0f;
    float GravityMagnitudeN = 0.0f;
    float AngleOfAttackDeg = 0.0f;
    float SideslipDeg = 0.0f;
    float AirDensityKgM3 = 1.225f;
    float DynamicPressurePa = 0.0f;
    float TrueAirspeedMS = 0.0f;
    float CL = 0.0f;
    float CD = 0.0f;
    bool bIsStalling = false;
};

/**
 * FAerodynamics
 *
 * Resolves 6-DOF aerodynamic forces and moments in Unreal Engine coordinates
 * (+X = Forward, +Y = Right, +Z = Up).
 */
class FLIGHTSIMULATOR_API FAerodynamics
{
public:
    static FAerodynamicSolution EvaluateSixDof(
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
        const UAircraftConfig* Config
    );
};
