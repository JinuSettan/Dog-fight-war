package com.example.data

import android.util.Log
import com.google.firebase.firestore.FirebaseFirestoreException
import org.json.JSONObject

enum class OperationType {
    CREATE, READ, UPDATE, DELETE, LIST
}

fun handleFirestoreError(
    exception: Exception,
    operationType: OperationType,
    resourcePath: String
) {
    val errorDetails = JSONObject().apply {
        put("operation", operationType.name)
        put("path", resourcePath)
        put("exceptionType", exception.javaClass.simpleName)
        put("message", exception.localizedMessage ?: "Unknown error")
        if (exception is FirebaseFirestoreException) {
            put("code", exception.code.name)
            put("codeValue", exception.code.value())
        }
    }
    Log.e("FirestoreError", errorDetails.toString(2), exception)
}
