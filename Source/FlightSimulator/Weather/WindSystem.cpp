#include "Weather/WindSystem.h"

UWindSystem::UWindSystem()
{
    PrimaryComponentTick.bCanEverTick = false;
}

void UWindSystem::UpdateWind(float DeltaTimeSec, float AltitudeMeters, float AirspeedMS)
{
    GustTimeAccumulator += DeltaTimeSec;

    if (!bEnableWind)
    {
        CurrentWindVelocityMS = FVector::ZeroVector;
        CurrentTurbulenceTorqueNm = FVector::ZeroVector;
        return;
    }

    const float AltitudeShear = 0.6f + FMath::Clamp(AltitudeMeters / 1500.0f, 0.0f, 0.8f);
    const FVector SteadyWind = BaseWindVelocityMS * AltitudeShear;

    if (!bEnableTurbulence || TurbulenceIntensity <= 0.001f)
    {
        CurrentWindVelocityMS = SteadyWind;
        CurrentTurbulenceTorqueNm = FVector::ZeroVector;
        return;
    }

    const float T = GustTimeAccumulator;
    const float Amp = TurbulenceIntensity * 3.2f;
    const float GX = Amp * (0.5f * FMath::Sin(T * 1.3f) + 0.3f * FMath::Cos(T * 3.1f) + 0.2f * FMath::Sin(T * 5.7f));
    const float GY = Amp * (0.5f * FMath::Cos(T * 1.1f) + 0.3f * FMath::Sin(T * 2.7f) + 0.2f * FMath::Cos(T * 6.3f));
    const float GZ = Amp * 0.7f * (0.5f * FMath::Cos(T * 1.9f) + 0.35f * FMath::Sin(T * 4.3f) + 0.15f * FMath::Cos(T * 7.1f));

    CurrentWindVelocityMS = SteadyWind + FVector(GX, GY, GZ);

    const float SpeedFactor = FMath::Clamp(AirspeedMS / 80.0f, 0.0f, 1.5f);
    const float RollGustNm = TurbulenceIntensity * SpeedFactor * 1800.0f * FMath::Sin(T * 2.9f + 1.1f);
    const float PitchGustNm = TurbulenceIntensity * SpeedFactor * 2400.0f * FMath::Cos(T * 2.1f + 0.4f);
    const float YawGustNm = TurbulenceIntensity * SpeedFactor * 1500.0f * FMath::Sin(T * 1.7f + 2.3f);
    CurrentTurbulenceTorqueNm = FVector(RollGustNm, PitchGustNm, YawGustNm);
}
