package com.example.data

import android.content.Context
import com.example.R
import com.google.firebase.Firebase
import com.google.firebase.auth.auth
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.snapshots
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.emitAll
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.tasks.await

class MultiplayerRepository(private val db: FirebaseFirestore) {

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

    suspend fun updatePlayerPosition(
        roomId: String,
        callsign: String,
        aircraftName: String,
        lat: Double,
        lon: Double,
        altFeet: Double,
        headingDeg: Double,
        pitchDeg: Double,
        rollDeg: Double,
        airspeedKnots: Double
    ) {
        val uid = requireUserId()
        val playerRef = db.collection("multiplayerRooms")
            .document(roomId)
            .collection("players")
            .document(uid)

        val payload = mapOf(
            "uid" to uid,
            "callsign" to callsign,
            "aircraftName" to aircraftName,
            "lat" to lat,
            "lon" to lon,
            "altFeet" to altFeet,
            "headingDeg" to headingDeg,
            "pitchDeg" to pitchDeg,
            "rollDeg" to rollDeg,
            "airspeedKnots" to airspeedKnots,
            "lastUpdated" to FieldValue.serverTimestamp()
        )

        try {
            playerRef.set(payload).await()
        } catch (e: Exception) {
            handleFirestoreError(e, OperationType.UPDATE, playerRef.path)
            throw e
        }
    }

    fun observeRoomPlayers(roomId: String): Flow<List<MultiplayerPlayerData>> = flow {
        val playersRef = db.collection("multiplayerRooms")
            .document(roomId)
            .collection("players")

        emitAll(
            playersRef.snapshots()
                .map { snapshot ->
                    snapshot.toObjects(MultiplayerPlayerData::class.java)
                }
                .catch { error ->
                    if (error is Exception) handleFirestoreError(error, OperationType.READ, playersRef.path)
                    throw error
                }
        )
    }

    suspend fun leaveRoom(roomId: String) {
        val uid = auth.currentUser?.uid ?: return
        val playerRef = db.collection("multiplayerRooms")
            .document(roomId)
            .collection("players")
            .document(uid)

        try {
            playerRef.delete().await()
        } catch (e: Exception) {
            handleFirestoreError(e, OperationType.DELETE, playerRef.path)
        }
    }
}
