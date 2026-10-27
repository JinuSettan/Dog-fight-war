#include "Aircraft/AircraftPawn.h"
#include "Components/StaticMeshComponent.h"
#include "GameFramework/SpringArmComponent.h"
#include "Camera/CameraComponent.h"
#include "Components/InputComponent.h"

AAircraftPawn::AAircraftPawn()
{
    PrimaryActorTick.bCanEverTick = true;

    AirframeMesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("AirframeMesh"));
    SetRootComponent(AirframeMesh);
    AirframeMesh->SetSimulatePhysics(false); // Driven by deterministic 6-DOF UAircraftFlightPhysics

    WindSystem = CreateDefaultSubobject<UWindSystem>(TEXT("WindSystem"));

    FlightPhysics = CreateDefaultSubobject<UAircraftFlightPhysics>(TEXT("FlightPhysics"));
    FlightPhysics->WindSystem = WindSystem;

    ChaseSpringArm = CreateDefaultSubobject<USpringArmComponent>(TEXT("ChaseSpringArm"));
    ChaseSpringArm->SetupAttachment(AirframeMesh);
    ChaseSpringArm->TargetArmLength = 1800.0f;
    ChaseSpringArm->bEnableCameraLag = true;
    ChaseSpringArm->CameraLagSpeed = 6.0f;
    ChaseSpringArm->bEnableCameraRotationLag = true;
    ChaseSpringArm->CameraRotationLagSpeed = 8.0f;

    ChaseCamera = CreateDefaultSubobject<UCameraComponent>(TEXT("ChaseCamera"));
    ChaseCamera->SetupAttachment(ChaseSpringArm, USpringArmComponent::SocketName);
}

void AAircraftPawn::SetupPlayerInputComponent(UInputComponent* PlayerInputComponent)
{
    Super::SetupPlayerInputComponent(PlayerInputComponent);

    PlayerInputComponent->BindAxis("Throttle", this, &AAircraftPawn::InputThrottleAxis);
    PlayerInputComponent->BindAxis("Pitch", this, &AAircraftPawn::InputPitchAxis);
    PlayerInputComponent->BindAxis("Roll", this, &AAircraftPawn::InputRollAxis);
    PlayerInputComponent->BindAxis("Yaw", this, &AAircraftPawn::InputYawAxis);

    PlayerInputComponent->BindAction("ToggleFlaps", IE_Pressed, this, &AAircraftPawn::InputToggleFlaps);
    PlayerInputComponent->BindAction("ToggleGear", IE_Pressed, this, &AAircraftPawn::InputToggleGear);
    PlayerInputComponent->BindAction("WheelBrakes", IE_Pressed, this, &AAircraftPawn::InputBrakesPressed);
    PlayerInputComponent->BindAction("WheelBrakes", IE_Released, this, &AAircraftPawn::InputBrakesReleased);
    PlayerInputComponent->BindAction("ToggleForceVectors", IE_Pressed, this, &AAircraftPawn::InputToggleForceVectors);
}

void AAircraftPawn::InputThrottleAxis(float Value)
{
    if (FlightPhysics && FMath::Abs(Value) > 0.01f)
    {
        const float NewThrottle = FlightPhysics->GetAircraftState().Throttle + Value * GetWorld()->GetDeltaSeconds() * 0.5f;
        FlightPhysics->SetThrottleInput(NewThrottle);
    }
}

void AAircraftPawn::InputPitchAxis(float Value)
{
    if (FlightPhysics) FlightPhysics->SetElevatorInput(Value);
}

void AAircraftPawn::InputRollAxis(float Value)
{
    if (FlightPhysics) FlightPhysics->SetAileronInput(Value);
}

void AAircraftPawn::InputYawAxis(float Value)
{
    if (FlightPhysics) FlightPhysics->SetRudderInput(Value);
}

void AAircraftPawn::InputToggleFlaps()
{
    if (FlightPhysics)
    {
        const float NextFlaps = (FlightPhysics->GetAircraftState().FlapsPosition < 0.5f) ? 1.0f : 0.0f;
        FlightPhysics->SetFlapsTarget(NextFlaps);
    }
}

void AAircraftPawn::InputToggleGear()
{
    if (FlightPhysics) FlightPhysics->ToggleLandingGear();
}

void AAircraftPawn::InputBrakesPressed()
{
    if (FlightPhysics) FlightPhysics->SetWheelBrakes(true);
}

void AAircraftPawn::InputBrakesReleased()
{
    if (FlightPhysics) FlightPhysics->SetWheelBrakes(false);
}

void AAircraftPawn::InputToggleForceVectors()
{
    if (FlightPhysics) FlightPhysics->bDrawForceVectors = !FlightPhysics->bDrawForceVectors;
}
