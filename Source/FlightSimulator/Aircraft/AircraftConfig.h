#pragma once

#include "CoreMinimal.h"
#include "Engine/DataAsset.h"
#include "AircraftConfig.generated.h"

/**
 * UAircraftConfig
 *
 * Data-driven physical and aerodynamic parameters for an aircraft type.
 * Can be authored as a DataAsset in the Unreal Editor to configure fighters,
 * trainers, or commercial airliners without recompiling C++.
 */
UCLASS(BlueprintType)
class FLIGHTSIMULATOR_API UAircraftConfig : public UPrimaryDataAsset
{
    GENERATED_BODY()

public:
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Identity")
    FString AircraftName = TEXT("F-16 Multirole Fighter Prototype");

    // --- Mass & Inertia ---
    /** Empty dry mass of the aircraft (kg) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Mass & Inertia", meta = (ClampMin = "100.0"))
    float EmptyMassKg = 8500.0f;

    /** Maximum internal fuel capacity (kg) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Mass & Inertia", meta = (ClampMin = "0.0"))
    float MaxFuelKg = 3175.0f;

    /** Principal Moment of Inertia in Roll (I_xx), Pitch (I_yy), Yaw (I_zz) in kg*m^2 */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Mass & Inertia")
    FVector MomentOfInertiaKgM2 = FVector(12800.0f, 75600.0f, 85500.0f);

    // --- Wing & Reference Geometry ---
    /** Reference wing planform area S (m^2) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Aerodynamics|Geometry", meta = (ClampMin = "1.0"))
    float WingAreaM2 = 27.87f;

    /** Wingspan b (m) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Aerodynamics|Geometry", meta = (ClampMin = "1.0"))
    float WingspanM = 9.96f;

    /** Mean aerodynamic chord c (m) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Aerodynamics|Geometry", meta = (ClampMin = "0.2"))
    float MeanChordM = 3.45f;

    /** Wing aspect ratio AR = b^2 / S */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Aerodynamics|Geometry", meta = (ClampMin = "1.0"))
    float AspectRatio = 3.56f;

    // --- Lift Polar Parameters ---
    /** Lift coefficient at zero Angle of Attack (CL_0) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Aerodynamics|Lift")
    float ZeroAlphaCL = 0.08f;

    /** Maximum clean lift coefficient before stall (CL_max) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Aerodynamics|Lift")
    float MaxCleanCL = 1.60f;

    /** Additional CL at full flap deflection */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Aerodynamics|Lift")
    float FlapsDeltaCL = 0.45f;

    /** Critical positive stall Angle of Attack (degrees) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Aerodynamics|Lift")
    float StallAngleDeg = 18.0f;

    // --- Drag Polar Parameters ---
    /** Parasitic zero-lift drag coefficient (CD_0) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Aerodynamics|Drag")
    float ParasiticCD0 = 0.020f;

    /** Induced drag factor k = 1 / (pi * e * AR) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Aerodynamics|Drag")
    float InducedDragFactorK = 0.045f;

    /** Full flaps drag increment */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Aerodynamics|Drag")
    float FlapsDeltaCD = 0.045f;

    /** Extended landing gear drag increment */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Aerodynamics|Drag")
    float GearDeltaCD = 0.035f;

    /** Deployed airbrake/spoiler drag increment */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Aerodynamics|Drag")
    float AirbrakeDeltaCD = 0.090f;

    // --- Propulsion ---
    /** Maximum sea-level dry military thrust (Newtons) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Propulsion")
    float MaxDryThrustN = 79000.0f;

    /** Maximum sea-level wet afterburner thrust (Newtons) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Propulsion")
    float MaxAfterburnerThrustN = 128000.0f;

    /** Engine turbine spool time constant (seconds) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Propulsion")
    float EngineSpoolRate = 1.8f;

    // --- Control & Stability Derivatives ---
    /** Pitch moment effectiveness from elevator input (Cm_de) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Aerodynamics|Control")
    float ElevatorEffectiveness = 1.35f;

    /** Roll moment effectiveness from aileron input (Cl_da) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Aerodynamics|Control")
    float AileronEffectiveness = 0.28f;

    /** Yaw moment effectiveness from rudder input (Cn_dr) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Aerodynamics|Control")
    float RudderEffectiveness = 0.14f;

    /** Static longitudinal stability derivative (Cm_alpha < 0 for stable aircraft) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Aerodynamics|Stability")
    float LongitudinalStabilityCmAlpha = -0.42f;

    /** Directional weathercock stability derivative (Cn_beta > 0 for stable vertical fin) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Aerodynamics|Stability")
    float DirectionalStabilityCnBeta = 0.22f;

    /** Lateral dihedral stability derivative (Cl_beta < 0 for stabilizing roll from sideslip) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Aerodynamics|Stability")
    float DihedralStabilityClBeta = -0.08f;

    // --- Ground & Landing Gear ---
    /** Target takeoff rotation speed Vr (knots) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Ground Operations")
    float RotationSpeedKnots = 140.0f;

    /** Maximum structural sink rate on touchdown before gear failure (ft/min) */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Ground Operations")
    float MaxTouchdownSinkRateFpm = 1500.0f;
};
