package com.example.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Flight
import androidx.compose.material.icons.filled.FlightLand
import androidx.compose.material.icons.filled.FlightTakeoff
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.example.map.Airport
import com.example.map.GlobalAirportDatabase

@Composable
fun AirportSelectionDialog(
    initialDeparture: Airport,
    initialArrival: Airport,
    onStartFlight: (departure: Airport, arrival: Airport) -> Unit,
    onDismiss: () -> Unit
) {
    var searchQuery by remember { mutableStateOf("") }
    var selectedDeparture by remember { mutableStateOf(initialDeparture) }
    var selectedArrival by remember { mutableStateOf(initialArrival) }
    var isSelectingArrival by remember { mutableStateOf(false) } // false = selecting departure, true = selecting arrival

    val searchResults = remember(searchQuery) {
        GlobalAirportDatabase.search(searchQuery)
    }

    val routeDistanceNm = remember(selectedDeparture, selectedArrival) {
        GlobalAirportDatabase.calculateDistanceNm(selectedDeparture, selectedArrival)
    }

    val routeBearingDeg = remember(selectedDeparture, selectedArrival) {
        GlobalAirportDatabase.calculateBearingDeg(selectedDeparture, selectedArrival)
    }

    Dialog(onDismissRequest = onDismiss) {
        Surface(
            modifier = Modifier
                .fillMaxWidth(0.95f)
                .fillMaxHeight(0.85f)
                .testTag("airport_selection_dialog"),
            shape = RoundedCornerShape(24.dp),
            color = Color(0xFF1C1B1F),
            tonalElevation = 8.dp
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(20.dp)
            ) {
                // Title
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = Icons.Default.Flight,
                            contentDescription = null,
                            tint = Color(0xFFD0BCFF),
                            modifier = Modifier.size(28.dp)
                        )
                        Spacer(Modifier.width(12.dp))
                        Text(
                            text = "Flight Plan & Route Selection",
                            color = Color(0xFFE6E1E5),
                            fontSize = 20.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                    TextButton(onClick = onDismiss) {
                        Text("Close", color = Color(0xFFCAC4D0))
                    }
                }

                Spacer(Modifier.height(16.dp))

                // Route summary cards
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    // Departure Card
                    Card(
                        modifier = Modifier
                            .weight(1f)
                            .clickable { isSelectingArrival = false },
                        colors = CardDefaults.cardColors(
                            containerColor = if (!isSelectingArrival) Color(0xFF381E72) else Color(0xFF2B2930)
                        ),
                        shape = RoundedCornerShape(14.dp)
                    ) {
                        Column(modifier = Modifier.padding(12.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Default.FlightTakeoff, contentDescription = null, tint = Color(0xFFD0BCFF), modifier = Modifier.size(16.dp))
                                Spacer(Modifier.width(6.dp))
                                Text("DEPARTURE", color = Color(0xFFD0BCFF), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                            }
                            Spacer(Modifier.height(4.dp))
                            Text(
                                text = "${selectedDeparture.name} (${selectedDeparture.iata})",
                                color = Color(0xFFE6E1E5),
                                fontSize = 13.sp,
                                fontWeight = FontWeight.SemiBold,
                                maxLines = 1
                            )
                            Text(
                                text = "${selectedDeparture.city}, ${selectedDeparture.country}",
                                color = Color(0xFFCAC4D0),
                                fontSize = 11.sp,
                                maxLines = 1
                            )
                        }
                    }

                    // Arrival Card
                    Card(
                        modifier = Modifier
                            .weight(1f)
                            .clickable { isSelectingArrival = true },
                        colors = CardDefaults.cardColors(
                            containerColor = if (isSelectingArrival) Color(0xFF381E72) else Color(0xFF2B2930)
                        ),
                        shape = RoundedCornerShape(14.dp)
                    ) {
                        Column(modifier = Modifier.padding(12.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Default.FlightLand, contentDescription = null, tint = Color(0xFFD0BCFF), modifier = Modifier.size(16.dp))
                                Spacer(Modifier.width(6.dp))
                                Text("ARRIVAL", color = Color(0xFFD0BCFF), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                            }
                            Spacer(Modifier.height(4.dp))
                            Text(
                                text = "${selectedArrival.name} (${selectedArrival.iata})",
                                color = Color(0xFFE6E1E5),
                                fontSize = 13.sp,
                                fontWeight = FontWeight.SemiBold,
                                maxLines = 1
                            )
                            Text(
                                text = "${selectedArrival.city}, ${selectedArrival.country}",
                                color = Color(0xFFCAC4D0),
                                fontSize = 11.sp,
                                maxLines = 1
                            )
                        }
                    }
                }

                Spacer(Modifier.height(12.dp))

                // Route Distance info
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color(0xFF2B2930), RoundedCornerShape(10.dp))
                        .padding(horizontal = 14.dp, vertical = 8.dp)
                ) {
                    Text(
                        text = "Great Circle Distance: %.1f NM (~%.0f km) | Initial Bearing: %.0f°".format(
                            routeDistanceNm,
                            routeDistanceNm * 1.852f,
                            routeBearingDeg
                        ),
                        color = Color(0xFFE6E1E5),
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Medium
                    )
                }

                Spacer(Modifier.height(16.dp))

                // Search Bar
                OutlinedTextField(
                    value = searchQuery,
                    onValueChange = { searchQuery = it },
                    placeholder = { Text("Search by airport name, IATA, ICAO, city, country...", color = Color(0xFF938F99)) },
                    leadingIcon = { Icon(Icons.Default.Search, contentDescription = null, tint = Color(0xFFD0BCFF)) },
                    singleLine = true,
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = Color(0xFFD0BCFF),
                        unfocusedBorderColor = Color(0xFF49454F),
                        focusedTextColor = Color(0xFFE6E1E5),
                        unfocusedTextColor = Color(0xFFE6E1E5)
                    ),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("airport_search_input")
                )

                Spacer(Modifier.height(12.dp))

                Text(
                    text = if (!isSelectingArrival) "Select Departure Airport:" else "Select Arrival Airport:",
                    color = Color(0xFFD0BCFF),
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold
                )

                Spacer(Modifier.height(8.dp))

                // Airport List
                LazyColumn(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(searchResults) { airport ->
                        val isSelected = (!isSelectingArrival && selectedDeparture == airport) ||
                                (isSelectingArrival && selectedArrival == airport)

                        Card(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable {
                                    if (!isSelectingArrival) {
                                        selectedDeparture = airport
                                        isSelectingArrival = true // auto switch to arrival selection for smooth flow
                                    } else {
                                        selectedArrival = airport
                                    }
                                },
                            colors = CardDefaults.cardColors(
                                containerColor = if (isSelected) Color(0xFF4F378B) else Color(0xFF2B2930)
                            ),
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(14.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = airport.name,
                                        color = Color(0xFFE6E1E5),
                                        fontSize = 14.sp,
                                        fontWeight = FontWeight.Bold
                                    )
                                    Spacer(Modifier.height(2.dp))
                                    Text(
                                        text = "${airport.city}, ${airport.country} • Elevation: %.0fm".format(airport.elevationMeters),
                                        color = Color(0xFFCAC4D0),
                                        fontSize = 12.sp
                                    )
                                }
                                Column(horizontalAlignment = Alignment.End) {
                                    Text(
                                        text = airport.iata.ifEmpty { airport.icao },
                                        color = Color(0xFFD0BCFF),
                                        fontSize = 16.sp,
                                        fontWeight = FontWeight.ExtraBold
                                    )
                                    Text(
                                        text = airport.icao,
                                        color = Color(0xFF938F99),
                                        fontSize = 11.sp
                                    )
                                }
                            }
                        }
                    }
                }

                Spacer(Modifier.height(16.dp))

                // Launch Flight Button
                Button(
                    onClick = {
                        onStartFlight(selectedDeparture, selectedArrival)
                        onDismiss()
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFD0BCFF)),
                    shape = RoundedCornerShape(14.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(50.dp)
                        .testTag("start_flight_button")
                ) {
                    Icon(Icons.Default.Flight, contentDescription = null, tint = Color(0xFF381E72))
                    Spacer(Modifier.width(8.dp))
                    Text(
                        text = "Spawn & Start Flight (${selectedDeparture.iata} → ${selectedArrival.iata})",
                        color = Color(0xFF381E72),
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
        }
    }
}
