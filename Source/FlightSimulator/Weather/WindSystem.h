#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "WindSystem.generated.h"

/**
 * UWindSystem
 *
 * Computes ambient 3D wind velocity (m/s) with altitude wind shear and
 * continuous Dryden-inspired atmospheric turbulence gusts.
 */
UCLASS(ClassGroup = (FlightSimulator), meta = (BlueprintSpawnableComponent))
class FLIGHTSIMULATOR_API UWindSystem : public UActorComponent
{
    GENERATED_BODY()

public:
    UWindSystem();

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Weather|Wind")
    bool bEnableWind = true;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Weather|Wind")
    bool bEnableTurbulence = true;

    /** Base steady wind velocity vector in World Space (m/s) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Weather|Wind")
    FVector BaseWindVelocityMS = FVector(-4.5f, 2.0f, 0.0f);

    /** Turbulence intensity [0.0 = Calm .. 1.0 = Severe] */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Weather|Turbulence", meta = (ClampMin = "0.0", ClampMax = "1.0"))
    float TurbulenceIntensity = 0.25f;

    /** Updates instantaneous wind and rotational gust disturbances. */
    void UpdateWind(float DeltaTimeSec, float AltitudeMeters, float AirspeedMS);

    UFUNCTION(BlueprintPure, Category = "Weather|Wind")
    FVector GetCurrentWindVelocityMS() const { return CurrentWindVelocityMS; }

    UFUNCTION(BlueprintPure, Category = "Weather|Turbulence")
    FVector GetCurrentTurbulenceTorqueNm() const { return CurrentTurbulenceTorqueNm; }

private:
    float GustTimeAccumulator = 0.0f;
    FVector CurrentWindVelocityMS = FVector::ZeroVector;
    FVector CurrentTurbulenceTorqueNm = FVector::ZeroVector;
};
