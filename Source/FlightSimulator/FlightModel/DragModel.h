#pragma once

#include "CoreMinimal.h"
#include "Aircraft/AircraftConfig.h"

/**
 * FDragModel
 *
 * Computes parasitic drag, lift-induced drag (including ground-effect vortex reduction),
 * mechanical drag from flaps/gear/airbrakes, sideslip drag, and post-stall separation drag.
 */
class FLIGHTSIMULATOR_API FDragModel
{
public:
    /** Ground-effect induced drag reduction factor when within 1 wingspan of the runway. */
    static float CalculateGroundEffectDragFactor(float HeightAGLMeters, float WingspanMeters);

    /** Computes total dimensionless Drag Coefficient (CD). */
    static float CalculateDragCoefficient(
        float CL,
        float AngleOfAttackDeg,
        float SideslipDeg,
        float FlapsPosition,
        float AirbrakePosition,
        float GearDownRatio,
        float HeightAGLMeters,
        const UAircraftConfig* Config
    );

    /** Computes total Drag force magnitude D = q * S * CD (Newtons). */
    static float CalculateDragForce(float DynamicPressurePa, float WingAreaM2, float CD);
};
