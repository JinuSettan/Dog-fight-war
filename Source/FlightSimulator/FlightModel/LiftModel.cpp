#include "FlightModel/LiftModel.h"

float FLiftModel::CalculateAirDensity(float AltitudeMeters)
{
    constexpr float SeaLevelDensity = 1.225f; // kg/m^3
    const float ClampedAlt = FMath::Max(0.0f, AltitudeMeters);
    return SeaLevelDensity * FMath::Exp(-ClampedAlt / 8500.0f);
}

float FLiftModel::CalculateGroundEffectLiftFactor(float HeightAGLMeters, float WingspanMeters)
{
    if (WingspanMeters <= 0.1f)
    {
        return 1.0f;
    }
    const float HeightRatio = FMath::Clamp(HeightAGLMeters / WingspanMeters, 0.0f, 1.0f);
    return 1.0f + (1.0f - HeightRatio) * 0.15f;
}

float FLiftModel::CalculateLiftCoefficient(
    float AngleOfAttackDeg,
    float FlapsPosition,
    float AirbrakePosition,
    bool bIsOnGround,
    float HeightAGLMeters,
    const UAircraftConfig* Config)
{
    if (!Config)
    {
        return 0.0f;
    }

    const float AlphaRad = FMath::DegreesToRadians(AngleOfAttackDeg);
    const float StallRad = FMath::DegreesToRadians(Config->StallAngleDeg);
    const float FlapsBoost = Config->FlapsDeltaCL * FMath::Clamp(FlapsPosition, 0.0f, 1.0f);
    const float SpoilerDump = bIsOnGround ? (-0.30f * FMath::Clamp(AirbrakePosition, 0.0f, 1.0f)) : 0.0f;
    const float GroundEffect = CalculateGroundEffectLiftFactor(HeightAGLMeters, Config->WingspanM);

    // Finite-wing 3D lift slope CL_alpha = 2 * pi * AR / (AR + 2)
    const float AR = FMath::Max(2.5f, Config->AspectRatio);
    const float LiftSlope = (2.0f * PI * AR) / (AR + 2.0f);

    float RawCL = 0.0f;
    if (FMath::Abs(AlphaRad) <= StallRad)
    {
        RawCL = (Config->ZeroAlphaCL + LiftSlope * AlphaRad + FlapsBoost + SpoilerDump) * GroundEffect;
    }
    else
    {
        // Post-stall flow separation decay
        const float Sign = (AlphaRad >= 0.0f) ? 1.0f : -1.0f;
        const float OverStallRad = FMath::Abs(AlphaRad) - StallRad;
        const float StallDropFactor = FMath::Max(0.15f, FMath::Cos(FMath::Min(HALF_PI, OverStallRad * 3.5f)));
        RawCL = Sign * (Config->MaxCleanCL + FlapsBoost) * StallDropFactor * GroundEffect;
    }

    return FMath::Clamp(RawCL, -1.5f, Config->MaxCleanCL + FlapsBoost);
}

float FLiftModel::CalculateLiftForce(float DynamicPressurePa, float WingAreaM2, float CL)
{
    return DynamicPressurePa * WingAreaM2 * CL;
}
