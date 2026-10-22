"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import "leaflet/dist/leaflet.css";
import {
  Locate,
  Layers,
  AlertTriangle,
  ShieldAlert,
  Copy,
  Check,
  Key,
  Settings2,
  X,
  Globe,
  Sparkles,
} from "lucide-react";

export interface OtherIncidentMapMarker {
  id: string;
  latitude: number;
  longitude: number;
  status: string;
  created_at: string;
  description?: string;
  user_id?: string;
}

export type MapProvider =
  | "maptiler"
  | "stadia"
  | "thunderforest"
  | "geoapify"
  | "locationiq"
  | "custom"
  | "osm_free";

export type MapStyle = "dark" | "streets" | "satellite";

interface EmergencyMapProps {
  latitude: number | null;
  longitude: number | null;
  accuracyMeters: number | null;
  isLocating?: boolean;
  incidentStatus?: string | null;
  markerTitle?: string;
  className?: string;
  onRecenter?: () => void;
  otherIncidents?: OtherIncidentMapMarker[];
  onSelectIncident?: (incidentId: string) => void;
}

function getTileConfig(
  provider: MapProvider,
  style: MapStyle,
  apiKey: string,
  customTemplate?: string
) {
  const cleanKey = apiKey.trim();

  // If user configured a custom URL template
  if (provider === "custom" && customTemplate) {
    const url = customTemplate.replace("{apiKey}", cleanKey).replace("{key}", cleanKey);
    return {
      url,
      options: {
        maxZoom: 19,
        attribution: '&copy; Custom OSM Tile Server',
      },
    };
  }

  // 1. MapTiler (Most popular OpenStreetMap vector & raster commercial provider)
  if (provider === "maptiler" && cleanKey) {
    let mapId = "dataviz-dark";
    if (style === "streets") mapId = "streets-v2";
    if (style === "satellite") mapId = "hybrid";
    const ext = style === "satellite" ? "jpg" : "png";
    return {
      url: `https://api.maptiler.com/maps/${mapId}/{z}/{x}/{y}.${ext}?key=${cleanKey}`,
      options: {
        maxZoom: 20,
        attribution:
          '&copy; <a href="https://www.maptiler.com/copyright/" target="_blank">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>',
      },
    };
  }

  // 2. Stadia Maps
  if (provider === "stadia" && cleanKey) {
    let layer = "alidade_smooth_dark";
    if (style === "streets") layer = "osm_bright";
    if (style === "satellite") layer = "alidade_satellite";
    const ext = style === "satellite" ? "jpg" : "png";
    return {
      url: `https://tiles.stadiamaps.com/tiles/${layer}/{z}/{x}/{y}{r}.${ext}?api_key=${cleanKey}`,
      options: {
        maxZoom: 20,
        attribution:
          '&copy; <a href="https://stadiamaps.com/" target="_blank">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OSM</a>',
      },
    };
  }

  // 3. Thunderforest
  if (provider === "thunderforest" && cleanKey) {
    let layer = "transport-dark";
    if (style === "streets") layer = "outdoors";
    if (style === "satellite") layer = "landscape";
    return {
      url: `https://tile.thunderforest.com/${layer}/{z}/{x}/{y}.png?apikey=${cleanKey}`,
      options: {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.thunderforest.com/" target="_blank">Thunderforest</a> &copy; OSM',
      },
    };
  }

  // 4. Geoapify
  if (provider === "geoapify" && cleanKey) {
    let layer = "dark-matter-purple-roads";
    if (style === "streets") layer = "osm-bright";
    if (style === "satellite") layer = "osm-carto";
    return {
      url: `https://maps.geoapify.com/v1/tile/${layer}/{z}/{x}/{y}.png?apiKey=${cleanKey}`,
      options: {
        maxZoom: 20,
        attribution:
          'Powered by <a href="https://www.geoapify.com/" target="_blank">Geoapify</a> | &copy; OSM',
      },
    };
  }

  // 5. LocationIQ
  if (provider === "locationiq" && cleanKey) {
    const layer = style === "dark" ? "dark" : "streets";
    return {
      url: `https://{s}-tiles.locationiq.com/v3/${layer}/r/{z}/{x}/{y}.png?key=${cleanKey}`,
      options: {
        maxZoom: 19,
        subdomains: "abc",
        attribution:
          '&copy; <a href="https://locationiq.com/" target="_blank">LocationIQ</a> &copy; OSM',
      },
    };
  }

  // 6. Free Public OSM / CARTO / ESRI Satellite (Fallback when no key is entered)
  if (style === "streets") {
    return {
      url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      options: {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors',
      },
    };
  }

  if (style === "satellite") {
    return {
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      options: {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.esri.com/" target="_blank">Esri</a> World Imagery &copy; OSM contributors',
      },
    };
  }

  // Default: Official OpenStreetMap Standard Tiles (tile.openstreetmap.org)
  return {
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    options: {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors',
    },
  };
}

export const EmergencyMap: React.FC<EmergencyMapProps> = ({
  latitude,
  longitude,
  accuracyMeters,
  isLocating = false,
  incidentStatus,
  markerTitle = "Current Device Position",
  className = "h-[360px] sm:h-[440px] w-full",
  onRecenter,
  otherIncidents = [],
  onSelectIncident,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const tileLayerRef = useRef<any>(null);
  const primaryMarkerRef = useRef<any>(null);
  const accuracyCircleRef = useRef<any>(null);
  const incidentMarkersRef = useRef<Map<string, any>>(new Map());

  const [isLeafletReady, setIsLeafletReady] = useState<boolean>(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [copiedCoords, setCopiedCoords] = useState<boolean>(false);

  // Map Provider & API Key State (Default: Free Official OpenStreetMap)
  const [apiKey, setApiKey] = useState<string>("");
  const [provider, setProvider] = useState<MapProvider>("osm_free");
  const [customUrl, setCustomUrl] = useState<string>("");
  const [tileStyle, setTileStyle] = useState<MapStyle>("streets");
  const [isKeyModalOpen, setIsKeyModalOpen] = useState<boolean>(false);
  const [keyInput, setKeyInput] = useState<string>("");
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);

  // Load configured API key on Mount (Fallback to free OpenStreetMap)
  useEffect(() => {
    const envKey = process.env.NEXT_PUBLIC_OSM_API_KEY || "";
    const envProvider = (process.env.NEXT_PUBLIC_MAP_PROVIDER as MapProvider) || "osm_free";
    const savedKey = typeof window !== "undefined" ? localStorage.getItem("piper_osm_api_key") : null;
    const savedProvider = typeof window !== "undefined" ? (localStorage.getItem("piper_osm_provider") as MapProvider) : null;
    const savedStyle = typeof window !== "undefined" ? (localStorage.getItem("piper_osm_style") as MapStyle) : null;
    const savedCustomUrl = typeof window !== "undefined" ? localStorage.getItem("piper_osm_custom_url") : null;

    const activeKey = savedKey !== null ? savedKey : envKey;
    const activeProv = savedProvider || (activeKey ? envProvider : "osm_free");
    const activeStyle = savedStyle || (activeKey ? "dark" : "streets");

    setApiKey(activeKey);
    setKeyInput(activeKey);
    setProvider(activeProv);
    setTileStyle(activeStyle);
    if (savedCustomUrl) setCustomUrl(savedCustomUrl);
  }, []);

  // 1. Initialize Leaflet Map on Mount
  useEffect(() => {
    let isMounted = true;

    async function initMap() {
      if (typeof window === "undefined" || !mapContainerRef.current) return;

      try {
        const L = (await import("leaflet")).default;
        if (!isMounted || !mapContainerRef.current) return;

        if (!mapInstanceRef.current) {
          const defaultLat = latitude ?? 31.6353;
          const defaultLon = longitude ?? 74.8237;
          const defaultZoom = latitude !== null ? 16 : 14;

          const map = L.map(mapContainerRef.current, {
            center: [defaultLat, defaultLon],
            zoom: defaultZoom,
            zoomControl: false,
            attributionControl: true,
          });

          // Mobile-friendly top-right zoom control
          L.control.zoom({ position: "topright" }).addTo(map);

          // Build tile layer using active provider and style
          const config = getTileConfig(provider, tileStyle, apiKey, customUrl);
          const tileLayer = L.tileLayer(config.url, config.options).addTo(map);

          tileLayerRef.current = tileLayer;
          mapInstanceRef.current = map;
        }

        setIsLeafletReady(true);
      } catch (err) {
        console.error("Leaflet initialization failed:", err);
        if (isMounted) {
          setMapError("Failed to initialize map tiles. Coordinates telemetry remains active.");
        }
      }
    }

    initMap();

    return () => {
      isMounted = false;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // 2. Update Tiles when Provider, Style, or API Key Changes
  const applyTileLayer = useCallback(
    async (prov: MapProvider, sty: MapStyle, keyVal: string, custUrl?: string) => {
      if (!mapInstanceRef.current) return;
      const L = (await import("leaflet")).default;
      const map = mapInstanceRef.current;

      if (tileLayerRef.current) {
        map.removeLayer(tileLayerRef.current);
      }

      const config = getTileConfig(prov, sty, keyVal, custUrl);
      const newLayer = L.tileLayer(config.url, config.options).addTo(map);
      tileLayerRef.current = newLayer;
    },
    []
  );

  useEffect(() => {
    if (isLeafletReady && mapInstanceRef.current) {
      applyTileLayer(provider, tileStyle, apiKey, customUrl);
    }
  }, [provider, tileStyle, apiKey, customUrl, isLeafletReady, applyTileLayer]);

  // Handle saving API key from UI Modal
  const handleSaveApiKey = () => {
    const trimmedKey = keyInput.trim();
    setApiKey(trimmedKey);
    if (typeof window !== "undefined") {
      localStorage.setItem("piper_osm_api_key", trimmedKey);
      localStorage.setItem("piper_osm_provider", provider);
      localStorage.setItem("piper_osm_style", tileStyle);
      if (customUrl) localStorage.setItem("piper_osm_custom_url", customUrl);
    }
    applyTileLayer(provider, tileStyle, trimmedKey, customUrl);
    setSaveFeedback("API Key and tile provider successfully applied!");
    setTimeout(() => {
      setSaveFeedback(null);
      setIsKeyModalOpen(false);
    }, 1200);
  };

  const handleClearKey = () => {
    setKeyInput("");
    setApiKey("");
    setProvider("osm_free");
    if (typeof window !== "undefined") {
      localStorage.removeItem("piper_osm_api_key");
      localStorage.setItem("piper_osm_provider", "osm_free");
    }
    applyTileLayer("osm_free", tileStyle, "", "");
    setSaveFeedback("Cleared key. Reverted to free public OpenStreetMap tiles.");
    setTimeout(() => setSaveFeedback(null), 1500);
  };

  // Cycle Quick Styles: Dark Tactical -> Streets OSM -> Satellite
  const cycleTileStyle = () => {
    const nextStyle: MapStyle =
      tileStyle === "dark" ? "streets" : tileStyle === "streets" ? "satellite" : "dark";
    setTileStyle(nextStyle);
    if (typeof window !== "undefined") {
      localStorage.setItem("piper_osm_style", nextStyle);
    }
  };

  // 3. Update Primary Device Marker & Accuracy Circle
  useEffect(() => {
    if (!isLeafletReady || !mapInstanceRef.current) return;

    async function updatePrimaryMarker() {
      const L = (await import("leaflet")).default;
      const map = mapInstanceRef.current;
      if (!map) return;

      if (latitude !== null && longitude !== null) {
        const latLng: [number, number] = [latitude, longitude];
        const isEmergencyActive =
          incidentStatus && incidentStatus !== "resolved" && incidentStatus !== "cancelled";

        const pulseHtml = `
          <div class="relative flex items-center justify-center w-8 h-8">
            <span class="absolute w-8 h-8 rounded-full ${
              isEmergencyActive ? "bg-red-500 animate-ping opacity-75" : "bg-emerald-500 opacity-60"
            }"></span>
            <span class="relative flex items-center justify-center w-6 h-6 rounded-full border-2 border-white ${
              isEmergencyActive
                ? "bg-red-600 shadow-lg shadow-red-500/80"
                : "bg-emerald-600 shadow-md shadow-emerald-500/50"
            }">
              <span class="w-2.5 h-2.5 rounded-full bg-white"></span>
            </span>
          </div>
        `;

        const customIcon = L.divIcon({
          className: "sos-device-marker",
          html: pulseHtml,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
          popupAnchor: [0, -16],
        });

        if (!primaryMarkerRef.current) {
          primaryMarkerRef.current = L.marker(latLng, { icon: customIcon }).addTo(map);
        } else {
          primaryMarkerRef.current.setLatLng(latLng);
          primaryMarkerRef.current.setIcon(customIcon);
        }

        const popupContent = `
          <div style="font-family: inherit; font-size: 12px; color: #F8FAFC; line-height: 1.5; padding: 2px;">
            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
              <span style="display: inline-block; width: 8px; height: 8px; border-radius: 9999px; background: ${
                isEmergencyActive ? "#EF4444" : "#10B981"
              };"></span>
              <strong style="color: ${isEmergencyActive ? "#F87171" : "#34D399"}; font-size: 13px;">
                ${markerTitle}
              </strong>
            </div>
            <div style="font-family: monospace; font-size: 11px; color: #E2E8F0; background: #1E293B; padding: 4px 6px; border-radius: 4px; border: 1px solid #334155; margin-bottom: 4px;">
              Lat: <strong>${latitude.toFixed(6)}°</strong><br/>
              Lon: <strong>${longitude.toFixed(6)}°</strong>
            </div>
            ${
              accuracyMeters !== null
                ? `<div style="color: #94A3B8; font-size: 11px;">Accuracy: <strong>&plusmn;${Math.round(
                    accuracyMeters
                  )}m</strong></div>`
                : ""
            }
          </div>
        `;

        primaryMarkerRef.current.bindPopup(popupContent);

        // Update Accuracy Circle
        if (accuracyMeters !== null && accuracyMeters > 0) {
          if (!accuracyCircleRef.current) {
            accuracyCircleRef.current = L.circle(latLng, {
              radius: accuracyMeters,
              color: isEmergencyActive ? "#DC2626" : "#059669",
              weight: 1.5,
              opacity: 0.8,
              fillColor: isEmergencyActive ? "#DC2626" : "#059669",
              fillOpacity: 0.15,
            }).addTo(map);
          } else {
            accuracyCircleRef.current.setLatLng(latLng);
            accuracyCircleRef.current.setRadius(accuracyMeters);
            accuracyCircleRef.current.setStyle({
              color: isEmergencyActive ? "#DC2626" : "#059669",
              fillColor: isEmergencyActive ? "#DC2626" : "#059669",
            });
          }
        }

        map.setView(latLng, Math.max(map.getZoom(), 16), { animate: true });
      }
    }

    updatePrimaryMarker();
  }, [latitude, longitude, accuracyMeters, isLeafletReady, incidentStatus, markerTitle]);

  // 4. Update Additional Incident Markers from Database & External Apps
  useEffect(() => {
    if (!isLeafletReady || !mapInstanceRef.current) return;

    async function updateOtherIncidents() {
      const L = (await import("leaflet")).default;
      const map = mapInstanceRef.current;
      if (!map) return;

      const currentIds = new Set(otherIncidents.map((inc) => inc.id));

      incidentMarkersRef.current.forEach((marker, id) => {
        if (!currentIds.has(id)) {
          map.removeLayer(marker);
          incidentMarkersRef.current.delete(id);
        }
      });

      otherIncidents.forEach((inc) => {
        if (
          latitude !== null &&
          longitude !== null &&
          Math.abs(inc.latitude - latitude) < 0.00001 &&
          Math.abs(inc.longitude - longitude) < 0.00001
        ) {
          return;
        }

        const latLng: [number, number] = [inc.latitude, inc.longitude];
        const isPending = inc.status === "pending" || inc.status === "active";

        const beaconHtml = `
          <div class="relative flex items-center justify-center w-7 h-7 cursor-pointer">
            <span class="absolute w-7 h-7 rounded-full ${
              isPending ? "bg-red-500 animate-ping opacity-75" : "bg-blue-500 opacity-40"
            }"></span>
            <span class="relative flex items-center justify-center w-5 h-5 rounded-full border-2 border-white ${
              isPending ? "bg-red-600 shadow-md shadow-red-600/70" : "bg-slate-700"
            }">
              <span class="w-1.5 h-1.5 rounded-full bg-white"></span>
            </span>
          </div>
        `;

        const incIcon = L.divIcon({
          className: "sos-incident-beacon",
          html: beaconHtml,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
          popupAnchor: [0, -14],
        });

        let marker = incidentMarkersRef.current.get(inc.id);
        if (!marker) {
          marker = L.marker(latLng, { icon: incIcon }).addTo(map);
          incidentMarkersRef.current.set(inc.id, marker);
        } else {
          marker.setLatLng(latLng);
          marker.setIcon(incIcon);
        }

        const incPopup = `
          <div style="font-family: inherit; font-size: 12px; color: #F8FAFC; line-height: 1.4; padding: 2px;">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px;">
              <strong style="color: #F87171; font-size: 12px;">INCIDENT #${inc.id.slice(0, 8)}</strong>
              <span style="font-size: 10px; font-weight: bold; padding: 2px 6px; border-radius: 4px; background: ${
                isPending ? "#7F1D1D" : "#1E293B"
              }; color: ${isPending ? "#FECACA" : "#94A3B8"};">
                ${inc.status.toUpperCase()}
              </span>
            </div>
            <div style="font-family: monospace; font-size: 11px; color: #CBD5E1; background: #0F172A; padding: 3px 6px; border-radius: 4px; border: 1px solid #334155; margin-bottom: 4px;">
              ${inc.latitude.toFixed(5)}°, ${inc.longitude.toFixed(5)}°
            </div>
            ${
              inc.description
                ? `<div style="color: #E2E8F0; font-size: 11px; margin-bottom: 4px;"><em>"${inc.description}"</em></div>`
                : ""
            }
            <div style="color: #64748B; font-size: 10px;">
              ${new Date(inc.created_at).toLocaleTimeString([], { hour12: false })}
            </div>
          </div>
        `;

        marker.bindPopup(incPopup);
        marker.on("click", () => {
          if (onSelectIncident) {
            onSelectIncident(inc.id);
          }
        });
      });
    }

    updateOtherIncidents();
  }, [otherIncidents, isLeafletReady, latitude, longitude, onSelectIncident]);

  const handleCenterClick = () => {
    if (mapInstanceRef.current && latitude !== null && longitude !== null) {
      mapInstanceRef.current.setView([latitude, longitude], 17, { animate: true });
    }
    if (onRecenter) onRecenter();
  };

  const copyCoordinates = () => {
    if (latitude !== null && longitude !== null) {
      navigator.clipboard.writeText(`${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
      setCopiedCoords(true);
      setTimeout(() => setCopiedCoords(false), 2000);
    }
  };

  return (
    <div className="relative isolate z-0 rounded-xl overflow-hidden border border-[#232832] bg-[#07080a] shadow-xl">
      {/* Map Canvas Container */}
      <div
        ref={mapContainerRef}
        className={className}
        tabIndex={0}
        aria-label="OpenStreetMap interactive tactical map view"
      />

      {/* Recenter & Map Controls Overlay (z-10) */}
      <div className="absolute bottom-3 right-3 z-10 flex items-center gap-2">
        {/* API Key / Provider Configuration Button */}
        <button
          type="button"
          onClick={() => setIsKeyModalOpen(true)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs font-medium transition cursor-pointer shadow-md ${
            apiKey
              ? "bg-emerald-950/90 text-emerald-300 border-emerald-700 hover:bg-emerald-900"
              : "bg-[#0F172A]/90 text-gray-300 border-gray-700 hover:bg-[#1E293B]"
          }`}
          title="Configure OpenStreetMap API Key or Provider"
          aria-label="Configure Map API Key"
        >
          <Key className={`w-3.5 h-3.5 ${apiKey ? "text-emerald-400" : "text-amber-400"}`} />
          <span className="font-mono text-[11px] hidden sm:inline">
            {apiKey ? "OSM Key: Active" : "Set API Key"}
          </span>
        </button>

        {/* Quick Style Switcher (Dark / Streets / Satellite) */}
        <button
          type="button"
          onClick={cycleTileStyle}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-[#0F172A]/90 hover:bg-[#1E293B] text-gray-200 border border-gray-700 shadow-md text-xs font-medium transition cursor-pointer"
          title={`Cycle map style (Current: ${tileStyle.toUpperCase()})`}
          aria-label="Toggle map style"
        >
          <Layers className="w-3.5 h-3.5 text-blue-400" />
          <span className="font-mono text-[11px] capitalize hidden sm:inline">{tileStyle}</span>
        </button>

        {/* Recenter Button */}
        <button
          type="button"
          onClick={handleCenterClick}
          disabled={latitude === null}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#0F172A]/90 hover:bg-[#1E293B] text-white border border-gray-700 shadow-md text-xs font-medium transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-red-500"
          title="Recenter on current GPS coordinates"
          aria-label="Recenter location on map"
        >
          <Locate className={`w-3.5 h-3.5 text-red-500 ${isLocating ? "animate-spin" : ""}`} />
          <span className="font-mono text-[11px]">Recenter</span>
        </button>
      </div>

      {/* Live Map Telemetry Header Overlay (z-10) */}
      <div className="absolute top-3 left-3 z-10 flex flex-wrap items-center gap-2 max-w-[calc(100%-80px)]">
        <div className="px-2.5 py-1.5 rounded-lg bg-[#0F172A]/90 backdrop-blur-md border border-gray-700/80 text-[11px] font-mono text-gray-200 flex items-center gap-2 shadow-lg">
          <span
            className={`w-2 h-2 rounded-full ${
              latitude !== null
                ? "bg-emerald-500 shadow-xs shadow-emerald-500"
                : isLocating
                ? "bg-amber-500 animate-pulse"
                : "bg-gray-500"
            }`}
          />
          <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-700/80 font-bold font-mono">
            OpenStreetMap
          </span>
          <span className="truncate">
            {latitude !== null && longitude !== null
              ? `${latitude.toFixed(5)}°, ${longitude.toFixed(5)}° (±${
                  accuracyMeters ? Math.round(accuracyMeters) : 0
                }m)`
              : isLocating
              ? "Acquiring GPS fix..."
              : "Awaiting Location Fix"}
          </span>

          {latitude !== null && (
            <button
              type="button"
              onClick={copyCoordinates}
              className="ml-1 text-gray-400 hover:text-white transition cursor-pointer"
              title="Copy coordinates"
              aria-label="Copy coordinates to clipboard"
            >
              {copiedCoords ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          )}
        </div>

        {/* Active Incident Counter Pill */}
        {otherIncidents.length > 0 && (
          <div className="px-2 py-1 rounded-md bg-red-950/80 border border-red-700/80 text-[10px] font-mono text-red-300 flex items-center gap-1.5 shadow-md">
            <ShieldAlert className="w-3 h-3 text-red-400" />
            <span>
              {otherIncidents.length} Distress Signal{otherIncidents.length > 1 ? "s" : ""} on Map
            </span>
          </div>
        )}
      </div>

      {/* Map API Key & Provider Configuration Modal (z-[99999]) */}
      {isKeyModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setIsKeyModalOpen(false)}
        >
          <div
            className="w-full max-w-lg p-6 rounded-2xl bg-[#111827] border border-blue-500/40 shadow-2xl space-y-4 text-left relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setIsKeyModalOpen(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white transition cursor-pointer"
              aria-label="Close API Key dialog"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-950 border border-blue-700 flex items-center justify-center shrink-0">
                <Key className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">OpenStreetMap &amp; Tile API Key Configuration</h3>
                <p className="text-xs text-gray-400">
                  Connect your dedicated OSM tile provider or commercial API key
                </p>
              </div>
            </div>

            {/* Provider Selector */}
            <div className="space-y-1.5">
              <label htmlFor="map-provider-select" className="block text-xs font-mono text-gray-300">
                Tile Provider:
              </label>
              <select
                id="map-provider-select"
                value={provider}
                onChange={(e) => setProvider(e.target.value as MapProvider)}
                className="w-full px-3 py-2 rounded-lg bg-[#0B1220] border border-gray-700 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="maptiler">MapTiler (OpenStreetMap Vector/Raster - Recommended)</option>
                <option value="stadia">Stadia Maps (Alidade Dark / Outdoors)</option>
                <option value="thunderforest">Thunderforest (OpenCycleMap / Transport Dark)</option>
                <option value="geoapify">Geoapify (Dark Matter / OSM Bright)</option>
                <option value="locationiq">LocationIQ (OpenStreetMap Fast CDN)</option>
                <option value="custom">Custom Tile Server URL Template</option>
                <option value="osm_free">Free OpenStreetMap / CARTO (No Key Required)</option>
              </select>
            </div>

            {/* API Key Input */}
            {provider !== "osm_free" && (
              <div className="space-y-1.5">
                <label htmlFor="map-api-key-input" className="block text-xs font-mono text-gray-300">
                  API Key:
                </label>
                <input
                  id="map-api-key-input"
                  type="text"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  placeholder="e.g. your-maptiler-or-provider-api-key"
                  className="w-full px-3.5 py-2.5 rounded-lg bg-[#0B1220] border border-gray-700 text-xs text-white font-mono placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}

            {/* Custom URL Template Input if Custom Provider Selected */}
            {provider === "custom" && (
              <div className="space-y-1.5">
                <label htmlFor="custom-tile-url-input" className="block text-xs font-mono text-gray-300">
                  Custom Tile URL Template:
                </label>
                <input
                  id="custom-tile-url-input"
                  type="text"
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  placeholder="https://your-tile-server/{z}/{x}/{y}.png?key={apiKey}"
                  className="w-full px-3 py-2 rounded-lg bg-[#0B1220] border border-gray-700 text-xs text-white font-mono placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}

            {/* Map Style Selector */}
            <div className="space-y-1.5">
              <span className="block text-xs font-mono text-gray-300">Default Map Style:</span>
              <div className="grid grid-cols-3 gap-2">
                {(["dark", "streets", "satellite"] as MapStyle[]).map((sty) => (
                  <button
                    key={sty}
                    type="button"
                    onClick={() => setTileStyle(sty)}
                    className={`py-2 px-3 rounded-lg border text-xs font-mono capitalize transition cursor-pointer text-center ${
                      tileStyle === sty
                        ? "bg-blue-950/80 border-blue-500 text-blue-200 font-bold"
                        : "bg-[#0B1220] border-gray-800 text-gray-400 hover:text-white"
                    }`}
                  >
                    {sty}
                  </button>
                ))}
              </div>
            </div>

            {/* Feedback Message */}
            {saveFeedback && (
              <div className="p-2.5 rounded-lg bg-emerald-950/60 border border-emerald-700 text-xs text-emerald-300">
                {saveFeedback}
              </div>
            )}

            {/* Quick Helper Links */}
            <div className="p-3 rounded-lg bg-[#0B1220] border border-gray-800 text-[11px] text-gray-400 space-y-1">
              <span className="font-semibold text-gray-300 block">Where to get a free API key:</span>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-blue-400 font-mono">
                <a href="https://cloud.maptiler.com/account/keys/" target="_blank" rel="noreferrer" className="underline hover:text-blue-300">
                  MapTiler (Free 100k req/mo)
                </a>
                <a href="https://client.stadiamaps.com/signup/" target="_blank" rel="noreferrer" className="underline hover:text-blue-300">
                  Stadia Maps
                </a>
                <a href="https://www.thunderforest.com/pricing/" target="_blank" rel="noreferrer" className="underline hover:text-blue-300">
                  Thunderforest
                </a>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-between pt-2 border-t border-gray-800">
              <button
                type="button"
                onClick={handleClearKey}
                className="px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-xs text-red-300 transition cursor-pointer"
              >
                Clear Key (Use Free Mode)
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsKeyModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-gray-800 text-gray-300 text-xs font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveApiKey}
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition cursor-pointer"
                >
                  Save &amp; Apply Key
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error Fallback Overlay if Leaflet or Tile Provider Fails */}
      {mapError && (
        <div className="absolute inset-0 bg-[#0B1220]/95 z-20 flex flex-col items-center justify-center p-6 text-center text-gray-300">
          <AlertTriangle className="w-8 h-8 text-amber-500 mb-2" />
          <p className="text-sm font-medium text-white mb-1">{mapError}</p>
          <p className="text-xs text-gray-400 max-w-sm">
            Emergency persistence is NOT affected. Your coordinates will still be recorded directly by the server.
          </p>
        </div>
      )}
    </div>
  );
};
