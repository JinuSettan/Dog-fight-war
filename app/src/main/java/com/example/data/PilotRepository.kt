package com.example.data

import android.content.Context
import com.example.R
import com.google.firebase.Firebase
import com.google.firebase.auth.auth
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import com.google.firebase.firestore.snapshots
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.emitAll
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.tasks.await

class PilotRepository(private val db: FirebaseFirestore) {

    constructor(context: Context) : this(
        FirebaseFirestore.getInstance(
            context.applicationContext.getString(R.string.firestore_database_id)
        )
    )

    private val auth = Firebase.auth

    private fun requireUserId(): String {
        return auth.currentUser?.uid
            ?: throw IllegalStateException("User must be signed in with Google before accessing Firestore.")
    }

    suspend fun createOrUpdatePilotProfile(displayName: String, email: String) {
        val uid = requireUserId()
        val userRef = db.collection("users").document(uid)
        try {
            val snapshot = userRef.get().await()
            if (!snapshot.exists()) {
                val profile = mapOf(
                    "uid" to uid,
                    "displayName" to displayName,
                    "email" to email,
                    "totalFlights" to 0L,
                    "carrierLandings" to 0L,
                    "createdAt" to FieldValue.serverTimestamp(),
                    "updatedAt" to FieldValue.serverTimestamp()
                )
                userRef.set(profile).await()
            } else {
                val updates = mapOf(
                    "displayName" to displayName,
                    "email" to email,
                    "updatedAt" to FieldValue.serverTimestamp()
                )
                userRef.update(updates).await()
            }
        } catch (e: Exception) {
            handleFirestoreError(e, OperationType.UPDATE, userRef.path)
            throw e
        }
    }

    fun observePilotProfile(): Flow<PilotProfile?> = flow {
        val uid = requireUserId()
        val docRef = db.collection("users").document(uid)
        emitAll(
            docRef.snapshots()
                .map { snapshot -> snapshot.toObject(PilotProfile::class.java) }
                .catch { error ->
                    if (error is Exception) handleFirestoreError(error, OperationType.READ, docRef.path)
                    throw error
                }
        )
    }

    suspend fun saveFlightLog(
        aircraftName: String,
        maxAirspeedKnots: Double,
        maxAltitudeFeet: Double,
        flightTimeSeconds: Double,
        landingQuality: String,
        sinkRateFpm: Double,
        isCarrierLanding: Boolean
    ) {
        val uid = requireUserId()
        val logsRef = db.collection("users").document(uid).collection("flightLogs")
        val payload = mapOf(
            "userId" to uid,
            "aircraftName" to aircraftName,
            "maxAirspeedKnots" to maxAirspeedKnots,
            "maxAltitudeFeet" to maxAltitudeFeet,
            "flightTimeSeconds" to flightTimeSeconds,
            "landingQuality" to landingQuality,
            "sinkRateFpm" to sinkRateFpm,
            "timestamp" to FieldValue.serverTimestamp()
        )
        try {
            logsRef.add(payload).await()

            // Increment flight counters on user profile
            val userRef = db.collection("users").document(uid)
            val updates = mutableMapOf<String, Any>(
                "totalFlights" to FieldValue.increment(1L),
                "updatedAt" to FieldValue.serverTimestamp()
            )
            if (isCarrierLanding) {
                updates["carrierLandings"] = FieldValue.increment(1L)
            }
            userRef.update(updates).await()
        } catch (e: Exception) {
            handleFirestoreError(e, OperationType.CREATE, logsRef.path)
            throw e
        }
    }

    fun observeFlightLogs(): Flow<List<FlightLog>> = flow {
        val uid = requireUserId()
        val logsRef = db.collection("users").document(uid).collection("flightLogs")
        emitAll(
            logsRef.orderBy("timestamp", Query.Direction.DESCENDING)
                .limit(20)
                .snapshots()
                .map { snapshot -> snapshot.toObjects(FlightLog::class.java) }
                .catch { error ->
                    if (error is Exception) handleFirestoreError(error, OperationType.READ, logsRef.path)
                    throw error
                }
        )
    }
}
