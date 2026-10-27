#include "FlightModel/EngineModel.h"

float FEngineModel::UpdateEngineSpool(
    float CurrentSpoolRatio,
    float TargetThrottle,
    bool bHasFuel,
    float DeltaTimeSec,
    const UAircraftConfig* Config)
{
    if (!bHasFuel)
    {
        return FMath::Max(0.0f, CurrentSpoolRatio - DeltaTimeSec * 0.6f);
    }

    const float SpoolRate = Config ? Config->EngineSpoolRate : 1.8f;
    const float ClampedTarget = FMath::Clamp(TargetThrottle, 0.0f, 1.0f);
    return CurrentSpoolRatio + (ClampedTarget - CurrentSpoolRatio) * FMath::Min(1.0f, DeltaTimeSec * SpoolRate);
}

float FEngineModel::CalculateThrustMagnitude(
    float SpoolRatio,
    bool bAfterburnerActive,
    float AirDensityKgM3,
    float TrueAirspeedMS,
    bool bHasFuel,
    const UAircraftConfig* Config)
{
    if (!bHasFuel || !Config)
    {
        return 0.0f;
    }

    const float DensityRatio = FMath::Clamp(AirDensityKgM3 / 1.225f, 0.15f, 1.05f);
    const float AltitudeLapse = FMath::Pow(DensityRatio, 0.60f);
    const float Mach = TrueAirspeedMS / 340.3f;
    const float RamRecovery = FMath::Clamp(1.0f + 0.14f * Mach * Mach, 1.0f, 1.25f);

    const float BaseMaxThrust = (bAfterburnerActive && SpoolRatio > 0.85f)
        ? Config->MaxAfterburnerThrustN
        : Config->MaxDryThrustN;

    return FMath::Clamp(SpoolRatio, 0.0f, 1.0f) * BaseMaxThrust * AltitudeLapse * RamRecovery;
}

float FEngineModel::CalculateFuelBurnKg(
    float ThrustN,
    bool bAfterburnerActive,
    float DeltaTimeSec)
{
    const float TSFC = bAfterburnerActive ? 0.000045f : 0.000020f;
    return FMath::Max(0.0f, ThrustN * TSFC * DeltaTimeSec);
}
