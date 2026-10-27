package com.example.data

import android.content.Context
import kotlin.random.Random

object GuestSessionManager {
    private const val PREFS_NAME = "guest_session_prefs"
    private const val KEY_IS_GUEST = "is_guest"
    private const val KEY_GUEST_CREATED_AT = "guest_created_at"
    private const val KEY_GUEST_CALLSIGN = "guest_callsign"

    fun isGuestSession(context: Context): Boolean {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        return prefs.getBoolean(KEY_IS_GUEST, false)
    }

    fun startGuestSession(context: Context): String {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val now = System.currentTimeMillis()
        val randomNum = Random.nextInt(1000, 9999)
        val callsign = "Guest-Pilot-$randomNum"

        if (!prefs.contains(KEY_GUEST_CREATED_AT)) {
            prefs.edit().putLong(KEY_GUEST_CREATED_AT, now).apply()
        }

        prefs.edit()
            .putBoolean(KEY_IS_GUEST, true)
            .putString(KEY_GUEST_CALLSIGN, callsign)
            .apply()

        return callsign
    }

    fun getGuestDaysRemaining(context: Context): Int {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val created = prefs.getLong(KEY_GUEST_CREATED_AT, System.currentTimeMillis())
        val elapsedMillis = System.currentTimeMillis() - created
        val elapsedDays = (elapsedMillis / (1000L * 60L * 60L * 24L)).toInt()
        return (3 - elapsedDays).coerceIn(0, 3)
    }

    fun getGuestCallsign(context: Context): String {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        return prefs.getString(KEY_GUEST_CALLSIGN, "Guest Pilot") ?: "Guest Pilot"
    }

    fun clearGuestSession(context: Context) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().clear().apply()
    }
}
