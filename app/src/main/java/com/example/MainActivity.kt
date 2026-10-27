package com.example

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.credentials.CredentialManager
import com.example.ui.AuthScreen
import com.example.ui.FlightSimulatorApp
import com.example.ui.attemptAutoSignIn
import com.example.ui.theme.MyApplicationTheme
import com.google.firebase.Firebase
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.auth

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            MyApplicationTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    MainAppContent()
                }
            }
        }
    }
}

@Composable
fun MainAppContent() {
    val context = androidx.compose.ui.platform.LocalContext.current
    var currentUser by remember { mutableStateOf(Firebase.auth.currentUser) }
    var isGuest by remember { mutableStateOf(com.example.data.GuestSessionManager.isGuestSession(context)) }

    DisposableEffect(Unit) {
        val listener = FirebaseAuth.AuthStateListener { auth ->
            currentUser = auth.currentUser
            if (auth.currentUser != null) {
                com.example.data.GuestSessionManager.clearGuestSession(context)
                isGuest = false
            }
        }
        Firebase.auth.addAuthStateListener(listener)
        onDispose {
            Firebase.auth.removeAuthStateListener(listener)
        }
    }

    if (currentUser != null) {
        FlightSimulatorApp(
            isGuest = false,
            onSignOut = {
                Firebase.auth.signOut()
                currentUser = null
                isGuest = false
            }
        )
    } else if (isGuest) {
        FlightSimulatorApp(
            isGuest = true,
            onSignOut = {
                com.example.data.GuestSessionManager.clearGuestSession(context)
                isGuest = false
            }
        )
    } else {
        AuthScreen(
            onAuthSuccess = {
                currentUser = Firebase.auth.currentUser
                isGuest = false
            },
            onGuestSuccess = {
                com.example.data.GuestSessionManager.startGuestSession(context)
                isGuest = true
            }
        )
    }
}
