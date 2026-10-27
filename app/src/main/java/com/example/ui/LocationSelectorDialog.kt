package com.example.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Explore
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRowDefaults.SecondaryIndicator
import androidx.compose.material3.TabRowDefaults.tabIndicatorOffset
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.example.map.RealWorldLocation

@Composable
fun LocationSelectorDialog(
    currentLocation: RealWorldLocation,
    onSelectLocation: (RealWorldLocation) -> Unit,
    onSelectCustomCoordinates: ((name: String, lat: Double, lng: Double) -> Unit)? = null,
    onDismiss: () -> Unit
) {
    var searchQuery by remember { mutableStateOf("") }
    var selectedCategoryIndex by remember { mutableIntStateOf(0) }
    var isCustomCoordMode by remember { mutableStateOf(false) }

    // Custom coord state
    var customName by remember { mutableStateOf("Custom Airfield") }
    var customLatStr by remember { mutableStateOf("%.4f".format(currentLocation.latitude)) }
    var customLngStr by remember { mutableStateOf("%.4f".format(currentLocation.longitude)) }
    var customCoordError by remember { mutableStateOf<String?>(null) }

    val categories = listOf("All Regions", "Americas", "Europe", "Asia", "Islands & Tropics")

    val filteredLocations = remember(searchQuery, selectedCategoryIndex) {
        RealWorldLocation.ALL_LOCATIONS.filter { loc ->
            val matchesSearch = searchQuery.isBlank() ||
                    loc.name.contains(searchQuery, ignoreCase = true) ||
                    loc.region.contains(searchQuery, ignoreCase = true) ||
                    loc.description.contains(searchQuery, ignoreCase = true)

            val matchesCategory = when (selectedCategoryIndex) {
                1 -> loc.region.contains("USA", ignoreCase = true) || loc.region.contains("Brazil", ignoreCase = true)
                2 -> loc.region.contains("Switzerland", ignoreCase = true) || loc.region.contains("UK", ignoreCase = true)
                3 -> loc.region.contains("India", ignoreCase = true) || loc.region.contains("Nepal", ignoreCase = true) || loc.region.contains("Japan", ignoreCase = true) || loc.region.contains("UAE", ignoreCase = true)
                4 -> loc.region.contains("Hawaii", ignoreCase = true) || loc.region.contains("Kerala", ignoreCase = true)
                else -> true
            }

            matchesSearch && matchesCategory
        }
    }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Card(
            colors = CardDefaults.cardColors(containerColor = Color(0xFF1C1B1F)),
            shape = RoundedCornerShape(24.dp),
            modifier = Modifier
                .fillMaxWidth(0.92f)
                .heightIn(max = 640.dp)
                .padding(16.dp)
                .testTag("location_selector_dialog")
        ) {
            Column(modifier = Modifier.padding(20.dp)) {
                // Header
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            Icons.Default.Explore,
                            contentDescription = "Explore",
                            tint = Color(0xFFD0BCFF),
                            modifier = Modifier.size(24.dp)
                        )
                        Spacer(Modifier.width(8.dp))
                        Column {
                            Text(
                                text = "Real-World Locations",
                                color = Color(0xFFE6E1E5),
                                fontSize = 18.sp,
                                fontWeight = FontWeight.Bold
                            )
                            Text(
                                text = "Licensed Google Maps Platform 3D Terrain",
                                color = Color(0xFFCCC2DC),
                                fontSize = 11.sp
                            )
                        }
                    }

                    IconButton(
                        onClick = { isCustomCoordMode = !isCustomCoordMode },
                        modifier = Modifier.testTag("toggle_custom_coord_button")
                    ) {
                        Icon(
                            Icons.Default.Map,
                            contentDescription = "Custom Coordinates",
                            tint = if (isCustomCoordMode) Color(0xFFD0BCFF) else Color(0xFF938F99)
                        )
                    }
                }

                Spacer(Modifier.height(12.dp))

                if (isCustomCoordMode) {
                    // CUSTOM COORDINATES INPUT FORM
                    Card(
                        colors = CardDefaults.cardColors(containerColor = Color(0xFF2B2930)),
                        shape = RoundedCornerShape(16.dp),
                        modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp)
                    ) {
                        Column(modifier = Modifier.padding(14.dp)) {
                            Text(
                                text = "Fly to Custom GPS Coordinates",
                                color = Color(0xFFD0BCFF),
                                fontWeight = FontWeight.Bold,
                                fontSize = 14.sp
                            )
                            Spacer(Modifier.height(8.dp))

                            OutlinedTextField(
                                value = customName,
                                onValueChange = { customName = it },
                                label = { Text("Location Name", fontSize = 11.sp) },
                                singleLine = true,
                                colors = OutlinedTextFieldDefaults.colors(
                                    focusedBorderColor = Color(0xFFD0BCFF),
                                    unfocusedBorderColor = Color(0xFF49454F),
                                    focusedTextColor = Color.White,
                                    unfocusedTextColor = Color.White
                                ),
                                modifier = Modifier.fillMaxWidth().testTag("custom_location_name_input")
                            )

                            Spacer(Modifier.height(8.dp))

                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                OutlinedTextField(
                                    value = customLatStr,
                                    onValueChange = { customLatStr = it },
                                    label = { Text("Latitude (-90 to +90)", fontSize = 11.sp) },
                                    singleLine = true,
                                    colors = OutlinedTextFieldDefaults.colors(
                                        focusedBorderColor = Color(0xFFD0BCFF),
                                        unfocusedBorderColor = Color(0xFF49454F),
                                        focusedTextColor = Color.White,
                                        unfocusedTextColor = Color.White
                                    ),
                                    modifier = Modifier.weight(1f).testTag("custom_lat_input")
                                )

                                OutlinedTextField(
                                    value = customLngStr,
                                    onValueChange = { customLngStr = it },
                                    label = { Text("Longitude (-180 to +180)", fontSize = 11.sp) },
                                    singleLine = true,
                                    colors = OutlinedTextFieldDefaults.colors(
                                        focusedBorderColor = Color(0xFFD0BCFF),
                                        unfocusedBorderColor = Color(0xFF49454F),
                                        focusedTextColor = Color.White,
                                        unfocusedTextColor = Color.White
                                    ),
                                    modifier = Modifier.weight(1f).testTag("custom_lng_input")
                                )
                            }

                            if (customCoordError != null) {
                                Text(
                                    text = customCoordError ?: "",
                                    color = Color(0xFFF2B8B5),
                                    fontSize = 11.sp,
                                    modifier = Modifier.padding(top = 4.dp)
                                )
                            }

                            Spacer(Modifier.height(12.dp))

                            Button(
                                onClick = {
                                    val lat = customLatStr.toDoubleOrNull()
                                    val lng = customLngStr.toDoubleOrNull()
                                    if (lat != null && lng != null && lat in -90.0..90.0 && lng in -180.0..180.0) {
                                        val loc = RealWorldLocation(
                                            name = customName.ifBlank { "Custom Coordinates" },
                                            region = "%.3f°, %.3f°".format(lat, lng),
                                            latitude = lat,
                                            longitude = lng,
                                            baseElevationMeters = 20f,
                                            description = "Custom waypoint flight zone",
                                            recommendedAltitudeFeet = 4000f,
                                            terrainMaxHeightMeters = 1000f
                                        )
                                        onSelectLocation(loc)
                                        onDismiss()
                                    } else {
                                        customCoordError = "Please enter valid Latitude (-90 to 90) and Longitude (-180 to 180)"
                                    }
                                },
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = Color(0xFFD0BCFF),
                                    contentColor = Color(0xFF381E72)
                                ),
                                shape = RoundedCornerShape(12.dp),
                                modifier = Modifier.fillMaxWidth().testTag("apply_custom_coord_button")
                            ) {
                                Icon(Icons.Default.LocationOn, contentDescription = "Spawn", modifier = Modifier.size(16.dp))
                                Spacer(Modifier.width(6.dp))
                                Text("SPAWN AT CUSTOM COORDINATES", fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                } else {
                    // SEARCH TEXT FIELD
                    OutlinedTextField(
                        value = searchQuery,
                        onValueChange = { searchQuery = it },
                        placeholder = { Text("Search San Francisco, Alps, Kerala, Canyon...", fontSize = 12.sp) },
                        leadingIcon = {
                            Icon(Icons.Default.Search, contentDescription = "Search", tint = Color(0xFFCCC2DC))
                        },
                        trailingIcon = {
                            if (searchQuery.isNotEmpty()) {
                                IconButton(onClick = { searchQuery = "" }) {
                                    Icon(Icons.Default.Clear, contentDescription = "Clear", tint = Color(0xFFCCC2DC))
                                }
                            }
                        },
                        singleLine = true,
                        shape = RoundedCornerShape(14.dp),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = Color(0xFFD0BCFF),
                            unfocusedBorderColor = Color(0xFF49454F),
                            focusedTextColor = Color.White,
                            unfocusedTextColor = Color.White
                        ),
                        modifier = Modifier.fillMaxWidth().testTag("location_search_input")
                    )

                    Spacer(Modifier.height(8.dp))

                    // CATEGORY FILTER TABS
                    ScrollableTabRow(
                        selectedTabIndex = selectedCategoryIndex,
                        containerColor = Color.Transparent,
                        contentColor = Color(0xFFD0BCFF),
                        indicator = { tabPositions ->
                            SecondaryIndicator(
                                Modifier.tabIndicatorOffset(tabPositions[selectedCategoryIndex]),
                                color = Color(0xFFD0BCFF)
                            )
                        },
                        edgePadding = 0.dp
                    ) {
                        categories.forEachIndexed { index, title ->
                            Tab(
                                selected = selectedCategoryIndex == index,
                                onClick = { selectedCategoryIndex = index },
                                text = {
                                    Text(
                                        text = title,
                                        fontSize = 11.sp,
                                        color = if (selectedCategoryIndex == index) Color(0xFFD0BCFF) else Color(0xFF938F99)
                                    )
                                }
                            )
                        }
                    }

                    Spacer(Modifier.height(8.dp))

                    // LOCATIONS LIST
                    LazyColumn(
                        modifier = Modifier
                            .fillMaxWidth()
                            .weight(1f, fill = false)
                    ) {
                        items(filteredLocations) { loc ->
                            val isSelected = (loc.name == currentLocation.name)
                            Card(
                                colors = CardDefaults.cardColors(
                                    containerColor = if (isSelected) Color(0xFFD0BCFF) else Color(0xFF2B2930)
                                ),
                                shape = RoundedCornerShape(14.dp),
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 4.dp)
                                    .clickable {
                                        onSelectLocation(loc)
                                        onDismiss()
                                    }
                                    .testTag("location_item_${loc.name.replace(" ", "_").replace("(", "").replace(")", "").replace("&", "and")}")
                            ) {
                                Column(modifier = Modifier.padding(12.dp)) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                            if (isSelected) {
                                                Icon(
                                                    Icons.Default.Check,
                                                    contentDescription = "Selected",
                                                    tint = Color(0xFF381E72),
                                                    modifier = Modifier.size(16.dp)
                                                )
                                                Spacer(Modifier.width(6.dp))
                                            }
                                            Text(
                                                text = loc.name,
                                                color = if (isSelected) Color(0xFF381E72) else Color(0xFFE6E1E5),
                                                fontWeight = FontWeight.Bold,
                                                fontSize = 14.sp
                                            )
                                        }
                                        Text(
                                            text = loc.region,
                                            color = if (isSelected) Color(0xFF381E72) else Color(0xFFD0BCFF),
                                            fontSize = 11.sp,
                                            fontWeight = FontWeight.Medium
                                        )
                                    }
                                    Spacer(Modifier.height(4.dp))
                                    Text(
                                        text = loc.description,
                                        color = if (isSelected) Color(0xFF332D41) else Color(0xFFCCC2DC),
                                        fontSize = 11.sp
                                    )
                                    Spacer(Modifier.height(4.dp))
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween
                                    ) {
                                        Text(
                                            text = "Coords: %.3f°, %.3f°".format(loc.latitude, loc.longitude),
                                            color = if (isSelected) Color(0xFF49454F) else Color(0xFF938F99),
                                            fontSize = 10.sp
                                        )
                                        Text(
                                            text = "Rec. Alt: %.0f FT | Base: %.0fm".format(loc.recommendedAltitudeFeet, loc.baseElevationMeters),
                                            color = if (isSelected) Color(0xFF49454F) else Color(0xFF938F99),
                                            fontSize = 10.sp
                                        )
                                    }
                                }
                            }
                        }
                    }
                }

                Spacer(Modifier.height(8.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End
                ) {
                    TextButton(onClick = onDismiss) {
                        Text("CLOSE", color = Color(0xFFD0BCFF))
                    }
                }
            }
        }
    }
}
