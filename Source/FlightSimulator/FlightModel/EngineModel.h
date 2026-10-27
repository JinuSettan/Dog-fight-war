#pragma once

#include "CoreMinimal.h"
#include "Aircraft/AircraftConfig.h"

/**
 * FEngineModel
 *
 * Models jet turbine spool dynamics, air-density thrust lapse, ram recovery,
 * afterburner augmentation, and specific fuel consumption.
 */
class FLIGHTSIMULATOR_API FEngineModel
{
public:
    /** Steps the engine spool ratio toward the commanded throttle with realistic rotational inertia lag. */
    static float UpdateEngineSpool(
        float CurrentSpoolRatio,
        float TargetThrottle,
        bool bHasFuel,
        float DeltaTimeSec,
        const UAircraftConfig* Config
    );

    /** Computes net propulsive thrust magnitude (Newtons) accounting for air density and Mach number. */
    static float CalculateThrustMagnitude(
        float SpoolRatio,
        bool bAfterburnerActive,
        float AirDensityKgM3,
        float TrueAirspeedMS,
        bool bHasFuel,
        const UAircraftConfig* Config
    );

    /** Computes fuel burned during DeltaTimeSec (kg). */
    static float CalculateFuelBurnKg(
        float ThrustN,
        bool bAfterburnerActive,
        float DeltaTimeSec
    );
};
