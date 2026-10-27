package com.example.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.example.physics.AircraftConfig

@Composable
fun AircraftSelectorDialog(
    currentConfig: AircraftConfig,
    onSelectAircraft: (AircraftConfig) -> Unit,
    onDismiss: () -> Unit
) {
    Dialog(onDismissRequest = onDismiss) {
        Card(
            colors = CardDefaults.cardColors(containerColor = Color(0xFF1C1B1F)),
            shape = RoundedCornerShape(24.dp),
            modifier = Modifier.padding(16.dp).testTag("aircraft_selector_dialog")
        ) {
            Column(modifier = Modifier.padding(20.dp)) {
                Text(
                    text = "Select Aircraft Model",
                    color = Color(0xFFE6E1E5),
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = "Test aerodynamics & wing loading across jet profiles",
                    color = Color(0xFFCCC2DC),
                    fontSize = 12.sp
                )

                Spacer(Modifier.height(16.dp))

                AircraftConfig.ALL_AIRCRAFT.forEach { config ->
                    val isSelected = (config.name == currentConfig.name)
                    Card(
                        colors = CardDefaults.cardColors(
                            containerColor = if (isSelected) Color(0xFFD0BCFF) else Color(0xFF2B2930)
                        ),
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 4.dp)
                            .clickable {
                                onSelectAircraft(config)
                                onDismiss()
                            }
                            .testTag("aircraft_item_${config.name.replace(" ", "_")}")
                    ) {
                        Column(modifier = Modifier.padding(12.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = config.name,
                                    color = if (isSelected) Color(0xFF381E72) else Color(0xFFE6E1E5),
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 14.sp
                                )
                                Text(
                                    text = "%.0f kg".format(config.massKg),
                                    color = if (isSelected) Color(0xFF381E72) else Color(0xFFD0BCFF),
                                    fontSize = 12.sp
                                )
                            }
                            Spacer(Modifier.height(4.dp))
                            Text(
                                text = config.description,
                                color = if (isSelected) Color(0xFF332D41) else Color(0xFFCCC2DC),
                                fontSize = 11.sp
                            )
                        }
                    }
                }

                Spacer(Modifier.height(12.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End
                ) {
                    TextButton(onClick = onDismiss) {
                        Text("CANCEL", color = Color(0xFFD0BCFF))
                    }
                }
            }
        }
    }
}
