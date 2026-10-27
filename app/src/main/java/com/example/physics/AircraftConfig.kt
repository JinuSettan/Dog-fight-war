package com.example.physics

data class AircraftConfig(
    val name: String,
    val massKg: Float,                      // Total gross mass (kg)
    val maxThrustN: Float,                  // Dry military thrust (N)
    val afterburnerThrustN: Float,          // Wet afterburner thrust (N)
    val wingAreaM2: Float,                  // Reference wing area S (m²)
    val wingspanM: Float = 9.96f,           // Wingspan b (m)
    val wingChordM: Float = 3.45f,          // Mean aerodynamic chord c (m)
    val aspectRatio: Float = 3.54f,         // Wing aspect ratio AR = b² / S
    val cL0: Float = 0.08f,                 // Zero-AoA camber lift coefficient
    val cD0: Float = 0.020f,                // Zero-lift parasitic drag coefficient
    val kInducedDrag: Float = 0.045f,       // Induced drag factor k = 1 / (pi * e * AR)
    val stallAngleDeg: Float = 18f,         // Critical angle of attack (deg)
    val cLMax: Float = 1.6f,                // Maximum clean lift coefficient
    val rotationSpeedKnots: Float = 140f,   // Vr speed for elevator rotation off runway
    val approachSpeedKnots: Float = 150f,   // Vapp target landing speed
    val maxTouchdownSinkRateFpm: Float = 1500f, // Structural gear collapse limit
    val pitchRateMaxRadSec: Float = 2.2f,   // Nominal pitch rate limit (rad/s)
    val rollRateMaxRadSec: Float = 4.0f,    // Nominal roll rate limit (rad/s)
    val yawRateMaxRadSec: Float = 1.0f,     // Nominal yaw rate limit (rad/s)
    val inertiaPitchKgM2: Float = 75600f,   // Pitch moment of inertia I_yy (kg·m²)
    val inertiaRollKgM2: Float = 12800f,    // Roll moment of inertia I_xx (kg·m²)
    val inertiaYawKgM2: Float = 85500f,     // Yaw moment of inertia I_zz (kg·m²)
    val fuelCapacityKg: Float = 3175f,      // Internal fuel capacity (kg)
    val maxG: Float = 9.0f,
    val minG: Float = -3.0f,
    val description: String
) {
    companion object {
        val F16_FIGHTER = AircraftConfig(
            name = "F-16 Jet Fighter",
            massKg = 8500f,
            maxThrustN = 79000f,
            afterburnerThrustN = 128000f,
            wingAreaM2 = 27.87f,
            wingspanM = 9.96f,
            wingChordM = 3.45f,
            aspectRatio = 3.56f,
            cL0 = 0.08f,
            cD0 = 0.020f,
            kInducedDrag = 0.045f,
            stallAngleDeg = 18f,
            cLMax = 1.6f,
            rotationSpeedKnots = 140f,
            approachSpeedKnots = 150f,
            maxTouchdownSinkRateFpm = 1500f,
            pitchRateMaxRadSec = 2.2f,
            rollRateMaxRadSec = 4.0f,
            yawRateMaxRadSec = 1.0f,
            inertiaPitchKgM2 = 75600f,
            inertiaRollKgM2 = 12800f,
            inertiaYawKgM2 = 85500f,
            fuelCapacityKg = 3175f,
            maxG = 9f,
            description = "High maneuverability multirole supersonic jet fighter with high thrust-to-weight ratio."
        )

        val TRAINER_JET = AircraftConfig(
            name = "L-39 Trainer Jet",
            massKg = 4200f,
            maxThrustN = 16900f,
            afterburnerThrustN = 21000f,
            wingAreaM2 = 18.8f,
            wingspanM = 9.46f,
            wingChordM = 2.15f,
            aspectRatio = 4.76f,
            cL0 = 0.12f,
            cD0 = 0.024f,
            kInducedDrag = 0.055f,
            stallAngleDeg = 15f,
            cLMax = 1.35f,
            rotationSpeedKnots = 95f,
            approachSpeedKnots = 110f,
            maxTouchdownSinkRateFpm = 1200f,
            pitchRateMaxRadSec = 1.5f,
            rollRateMaxRadSec = 2.5f,
            yawRateMaxRadSec = 0.7f,
            inertiaPitchKgM2 = 24000f,
            inertiaRollKgM2 = 6200f,
            inertiaYawKgM2 = 28500f,
            fuelCapacityKg = 1100f,
            maxG = 7f,
            description = "Forgiving lightweight jet trainer, ideal for learning pitch, roll, and landing dynamics."
        )

        val COMMERCIAL_JET = AircraftConfig(
            name = "Heavy Jet Transport",
            massKg = 45000f,
            maxThrustN = 180000f,
            afterburnerThrustN = 220000f,
            wingAreaM2 = 120f,
            wingspanM = 34.3f,
            wingChordM = 4.1f,
            aspectRatio = 9.8f,
            cL0 = 0.16f,
            cD0 = 0.028f,
            kInducedDrag = 0.038f,
            stallAngleDeg = 14f,
            cLMax = 1.8f,
            rotationSpeedKnots = 155f,
            approachSpeedKnots = 140f,
            maxTouchdownSinkRateFpm = 1000f,
            pitchRateMaxRadSec = 0.8f,
            rollRateMaxRadSec = 1.2f,
            yawRateMaxRadSec = 0.4f,
            inertiaPitchKgM2 = 1450000f,
            inertiaRollKgM2 = 580000f,
            inertiaYawKgM2 = 1850000f,
            fuelCapacityKg = 18000f,
            maxG = 2.5f,
            description = "High mass, large wing inertia jet transport. Smooth stability and realistic landing flare."
        )

        val ALL_AIRCRAFT = listOf(F16_FIGHTER, TRAINER_JET, COMMERCIAL_JET)
    }
}
