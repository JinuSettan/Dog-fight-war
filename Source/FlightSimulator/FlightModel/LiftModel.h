#pragma once

#include "CoreMinimal.h"
#include "Aircraft/AircraftConfig.h"

/**
 * FLiftModel
 *
 * Computes ISA atmospheric air density, ground-effect lift increment,
 * and Lift Coefficient (CL) across pre-stall and post-stall Angle of Attack regimes.
 */
class FLIGHTSIMULATOR_API FLiftModel
{
public:
    /** Calculates air density (kg/m^3) at a given MSL altitude (meters) using the ISA barometric model. */
    static float CalculateAirDensity(float AltitudeMeters);

    /** Calculates ground-effect lift multiplier when height AGL is less than one wingspan. */
    static float CalculateGroundEffectLiftFactor(float HeightAGLMeters, float WingspanMeters);

    /** Calculates total Lift Coefficient (CL) from Angle of Attack (degrees), flaps, airbrake, and ground effect. */
    static float CalculateLiftCoefficient(
        float AngleOfAttackDeg,
        float FlapsPosition,
        float AirbrakePosition,
        bool bIsOnGround,
        float HeightAGLMeters,
        const UAircraftConfig* Config
    );

    /** Calculates Lift force magnitude L = q * S * CL (Newtons). */
    static float CalculateLiftForce(float DynamicPressurePa, float WingAreaM2, float CL);
};
