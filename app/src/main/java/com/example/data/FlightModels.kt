package com.example.data

import com.google.firebase.Timestamp
import com.google.firebase.firestore.DocumentId
import com.google.firebase.firestore.IgnoreExtraProperties
import com.google.firebase.firestore.ServerTimestamp

@IgnoreExtraProperties
data class PilotProfile(
    @DocumentId val uid: String = "",
    val displayName: String = "Pilot",
    val email: String = "",
    val totalFlights: Long = 0L,
    val carrierLandings: Long = 0L,
    @ServerTimestamp val createdAt: Timestamp? = null,
    @ServerTimestamp val updatedAt: Timestamp? = null
)

@IgnoreExtraProperties
data class FlightLog(
    @DocumentId val id: String = "",
    val userId: String = "",
    val aircraftName: String = "F-16C Viper",
    val maxAirspeedKnots: Double = 0.0,
    val maxAltitudeFeet: Double = 0.0,
    val flightTimeSeconds: Double = 0.0,
    val landingQuality: String = "",
    val sinkRateFpm: Double = 0.0,
    @ServerTimestamp val timestamp: Timestamp? = null
)

@IgnoreExtraProperties
data class MultiplayerPlayerData(
    @DocumentId val uid: String = "",
    val callsign: String = "Maverick",
    val aircraftName: String = "F-16C Viper",
    val lat: Double = 0.0,
    val lon: Double = 0.0,
    val altFeet: Double = 0.0,
    val headingDeg: Double = 0.0,
    val pitchDeg: Double = 0.0,
    val rollDeg: Double = 0.0,
    val airspeedKnots: Double = 0.0,
    @ServerTimestamp val lastUpdated: Timestamp? = null
)
