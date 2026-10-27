#include "FlightModel/DragModel.h"

float FDragModel::CalculateGroundEffectDragFactor(float HeightAGLMeters, float WingspanMeters)
{
    if (WingspanMeters <= 0.1f)
    {
        return 1.0f;
    }
    const float HeightRatio = FMath::Clamp(HeightAGLMeters / WingspanMeters, 0.0f, 1.0f);
    return 1.0f - (1.0f - HeightRatio) * 0.35f;
}

float FDragModel::CalculateDragCoefficient(
    float CL,
    float AngleOfAttackDeg,
    float SideslipDeg,
    float FlapsPosition,
    float AirbrakePosition,
    float GearDownRatio,
    float HeightAGLMeters,
    const UAircraftConfig* Config)
{
    if (!Config)
    {
        return 0.02f;
    }

    const float GroundEffectDragFactor = CalculateGroundEffectDragFactor(HeightAGLMeters, Config->WingspanM);
    const float InducedCD = Config->InducedDragFactorK * CL * CL * GroundEffectDragFactor;

    const float FlapsCD = Config->FlapsDeltaCD * FMath::Clamp(FlapsPosition, 0.0f, 1.0f);
    const float AirbrakeCD = Config->AirbrakeDeltaCD * FMath::Clamp(AirbrakePosition, 0.0f, 1.0f);
    const float GearCD = Config->GearDeltaCD * FMath::Clamp(GearDownRatio, 0.0f, 1.0f);

    const float BetaRad = FMath::DegreesToRadians(SideslipDeg);
    const float SideslipCD = 0.15f * FMath::Square(FMath::Sin(BetaRad));

    const float OverStallDeg = FMath::Max(0.0f, FMath::Abs(AngleOfAttackDeg) - Config->StallAngleDeg);
    const float OverStallRad = FMath::DegreesToRadians(OverStallDeg);
    const float StallPressureCD = (OverStallDeg > 0.0f) ? (1.15f * FMath::Square(FMath::Sin(OverStallRad))) : 0.0f;

    return Config->ParasiticCD0 + InducedCD + FlapsCD + AirbrakeCD + GearCD + SideslipCD + StallPressureCD;
}

float FDragModel::CalculateDragForce(float DynamicPressurePa, float WingAreaM2, float CD)
{
    return FMath::Max(0.0f, DynamicPressurePa * WingAreaM2 * CD);
}
