#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Pawn.h"
#include "Aircraft/AircraftFlightPhysics.h"
#include "Weather/WindSystem.h"
#include "AircraftPawn.generated.h"

class UStaticMeshComponent;
class USpringArmComponent;
class UCameraComponent;

/**
 * AAircraftPawn
 *
 * Minimal Phase 1 Test Aircraft Pawn assembling the 3D airframe mesh,
 * UAircraftFlightPhysics component, UWindSystem component, and test input bindings.
 */
UCLASS()
class FLIGHTSIMULATOR_API AAircraftPawn : public APawn
{
    GENERATED_BODY()

public:
    AAircraftPawn();

    virtual void SetupPlayerInputComponent(class UInputComponent* PlayerInputComponent) override;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Aircraft")
    TObjectPtr<UStaticMeshComponent> AirframeMesh;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Aircraft")
    TObjectPtr<UAircraftFlightPhysics> FlightPhysics;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Aircraft")
    TObjectPtr<UWindSystem> WindSystem;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Camera")
    TObjectPtr<USpringArmComponent> ChaseSpringArm;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Camera")
    TObjectPtr<UCameraComponent> ChaseCamera;

private:
    void InputThrottleAxis(float Value);
    void InputPitchAxis(float Value);
    void InputRollAxis(float Value);
    void InputYawAxis(float Value);
    void InputToggleFlaps();
    void InputToggleGear();
    void InputBrakesPressed();
    void InputBrakesReleased();
    void InputToggleForceVectors();
};
