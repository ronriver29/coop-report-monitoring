import React, { useState, useEffect, useMemo } from 'react';
import { APIProvider, Map, AdvancedMarker, InfoWindow, Pin, useAdvancedMarkerRef } from '@vis.gl/react-google-maps';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Map as MapIcon, 
  Search, 
  SlidersHorizontal, 
  MapPin, 
  Building2, 
  Info, 
  Compass, 
  RotateCcw,
  List,
  ChevronDown,
  Layers,
  Sparkles,
  RefreshCw,
  AlertCircle,
  FileCheck2,
  Calendar,
  DollarSign
} from 'lucide-react';
import { apiRequest } from '../lib/api.ts';
import { 
  PHILIPPINE_REGIONS, 
  PHILIPPINE_PROVINCES, 
  COOPERATIVE_CLUSTERS, 
  ALL_COOP_TYPES 
} from '../constants.ts';

// -------------------------------------------------------------
// SECURE API KEY DERIVATION
// -------------------------------------------------------------
let API_KEY =
  process.env.GOOGLE_MAPS_PLATFORM_KEY ||
  (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
  (globalThis as any).GOOGLE_MAPS_PLATFORM_KEY ||
  '';

// Fix for duplicated key issue when pasting into AI Studio settings
if (API_KEY.length === 78 && API_KEY.startsWith('AIza') && API_KEY.slice(0, 39) === API_KEY.slice(39)) {
  API_KEY = API_KEY.slice(0, 39);
}

const isPlaceholder = (key: string) => {
  if (!key) return true;
  const k = key.toUpperCase().trim();
  return (
    k === '' ||
    k === 'YOUR_API_KEY' ||
    k.includes('YOUR_GOOGLE_MAPS_KEY_HERE') ||
    k.includes('YOUR_') ||
    k.includes('PLACEHOLDER') ||
    k.length < 15
  );
};

const hasValidKey = Boolean(API_KEY) && !isPlaceholder(API_KEY);

// -------------------------------------------------------------
// GEOGRAPHIC CENTROIDS DICTIONARY (PHILIPPINE REGIONS & PROVINCES)
// -------------------------------------------------------------
const REGION_COORDS: Record<string, { lat: number; lng: number }> = {
  'NCR': { lat: 14.5995, lng: 120.9842 },
  'CAR': { lat: 17.3512, lng: 121.1719 },
  'REG_I': { lat: 16.5445, lng: 120.3857 },
  'REG_II': { lat: 17.7554, lng: 121.6200 },
  'REG_III': { lat: 15.4827, lng: 120.7120 },
  'REG_IVA': { lat: 14.1008, lng: 121.2594 },
  'MIMAROPA': { lat: 12.8797, lng: 121.7740 },
  'REG_V': { lat: 13.4210, lng: 123.4132 },
  'REG_VI': { lat: 11.0050, lng: 122.5373 },
  'REG_VII': { lat: 9.9142, lng: 123.6338 },
  'REG_VIII': { lat: 11.1091, lng: 124.9701 },
  'REG_IX': { lat: 7.9171, lng: 123.0135 },
  'REG_X': { lat: 8.0203, lng: 124.6857 },
  'REG_XI': { lat: 7.3042, lng: 125.6853 },
  'REG_XII': { lat: 6.4710, lng: 124.8800 },
  'REG_XIII': { lat: 9.0435, lng: 125.8058 },
  'NIR': { lat: 10.3235, lng: 122.9550 },
  'BARMM': { lat: 7.2201, lng: 124.2428 }
};

const PROVINCE_COORDS: Record<string, { lat: number; lng: number }> = {
  // Region I
  'ILOCOS_NORTE': { lat: 18.1652, lng: 120.6974 },
  'ILOCOS_SUR': { lat: 17.2023, lng: 120.4789 },
  'LA_UNION': { lat: 16.5984, lng: 120.3662 },
  'PANGASINAN': { lat: 15.9037, lng: 120.3541 },
  // Region II
  'BATANES': { lat: 20.4484, lng: 121.9708 },
  'CAGAYAN': { lat: 18.0645, lng: 121.9056 },
  'ISABELA': { lat: 16.9754, lng: 121.9309 },
  'NUEVA_VIZCAYA': { lat: 16.2941, lng: 121.1343 },
  'QUIRINO': { lat: 16.2369, lng: 121.5175 },
  // Region III
  'AURORA': { lat: 15.9926, lng: 121.5624 },
  'BATAAN': { lat: 14.6300, lng: 120.4500 },
  'BULACAN': { lat: 14.9744, lng: 121.0594 },
  'NUEVA_ECIJA': { lat: 15.5906, lng: 120.9735 },
  'PAMPANGA': { lat: 15.0622, lng: 120.6559 },
  'TARLAC': { lat: 15.4852, lng: 120.5931 },
  'ZAMBALES': { lat: 15.3255, lng: 120.1081 },
  // CALABARZON
  'BATANGAS': { lat: 13.8996, lng: 121.0664 },
  'CAVITE': { lat: 14.2813, lng: 120.9190 },
  'LAGUNA': { lat: 14.2183, lng: 121.4348 },
  'QUEZON': { lat: 14.1645, lng: 121.9272 },
  'RIZAL': { lat: 14.5975, lng: 121.2333 },
  // MIMAROPA
  'MARINDUQUE': { lat: 13.4168, lng: 121.9712 },
  'OCCIDENTAL_MINDORO': { lat: 13.1416, lng: 120.7303 },
  'ORIENTAL_MINDORO': { lat: 13.1593, lng: 121.3129 },
  'PALAWAN': { lat: 9.8349, lng: 118.7384 },
  'ROMBLON': { lat: 12.5736, lng: 122.2713 },
  // Region V
  'ALBAY': { lat: 13.1783, lng: 123.6425 },
  'CAMARINES_NORTE': { lat: 14.1167, lng: 122.9167 },
  'CAMARINES_SUR': { lat: 13.6218, lng: 123.1948 },
  'CATANDUANES': { lat: 13.7946, lng: 124.2374 },
  'MASBATE': { lat: 12.3333, lng: 123.5833 },
  'SORSOGON': { lat: 12.8252, lng: 123.9936 },
  // Region VI
  'AKLAN': { lat: 11.5555, lng: 122.2612 },
  'ANTIQUE': { lat: 11.2000, lng: 122.1000 },
  'CAPIZ': { lat: 11.3503, lng: 122.6288 },
  'GUIMARAS': { lat: 10.6033, lng: 122.6256 },
  'ILOILO': { lat: 11.0050, lng: 122.5373 },
  // Negros Island
  'NEGROS_OCCIDENTAL': { lat: 10.2000, lng: 123.0000 },
  'NEGROS_ORIENTAL': { lat: 9.6000, lng: 123.0000 },
  // Region VII
  'BOHOL': { lat: 9.8500, lng: 124.1435 },
  'CEBU': { lat: 10.3157, lng: 123.8854 },
  'SIQUIJOR': { lat: 9.1841, lng: 123.5931 },
  // Region VIII
  'BILIRAN': { lat: 11.5833, lng: 124.4667 },
  'EASTERN_SAMAR': { lat: 11.6667, lng: 125.3333 },
  'LEYTE': { lat: 10.9701, lng: 124.8800 },
  'NORTHERN_SAMAR': { lat: 12.3333, lng: 124.7500 },
  'SAMAR': { lat: 11.7500, lng: 124.9833 },
  'SOUTHERN_LEYTE': { lat: 10.2833, lng: 124.9833 },
  // Region IX
  'ZAMBOANGA_DEL_NORTE': { lat: 8.1667, lng: 122.6667 },
  'ZAMBOANGA_DEL_SUR': { lat: 7.6667, lng: 123.0000 },
  'ZAMBOANGA_SIBUGAY': { lat: 7.7500, lng: 122.5833 },
  // Region X
  'BUKIDNON': { lat: 8.0163, lng: 124.9126 },
  'CAMIGUIN': { lat: 9.1856, lng: 124.7331 },
  'LANAO_DEL_NORTE': { lat: 7.9167, lng: 124.0000 },
  'MISAMIS_OCCIDENTAL': { lat: 8.3333, lng: 123.7500 },
  'MISAMIS_ORIENTAL': { lat: 8.5714, lng: 124.7431 },
  // Region XI
  'DAVAO_DE_ORO': { lat: 7.4200, lng: 126.0000 },
  'DAVAO_DEL_NORTE': { lat: 7.5000, lng: 125.7500 },
  'DAVAO_DEL_SUR': { lat: 6.7492, lng: 125.3582 },
  'DAVAO_OCCIDENTAL': { lat: 5.9224, lng: 125.4334 },
  'DAVAO_ORIENTAL': { lat: 7.0294, lng: 126.2300 },
  // Region XII
  'COTABATO': { lat: 7.1667, lng: 124.9167 },
  'SARANGANI': { lat: 5.9525, lng: 125.1091 },
  'SOUTH_COTABATO': { lat: 6.2500, lng: 124.9167 },
  'SULTAN_KUDARAT': { lat: 6.2500, lng: 124.5000 },
  // Caraga
  'AGUSAN_DEL_NORTE': { lat: 9.0000, lng: 125.5000 },
  'AGUSAN_DEL_SUR': { lat: 8.3333, lng: 125.8333 },
  'DINAGAT_ISLANDS': { lat: 10.1333, lng: 125.6000 },
  'SURIGAO_DEL_NORTE': { lat: 9.6833, lng: 125.6333 },
  'SURIGAO_DEL_SUR': { lat: 8.8333, lng: 126.2167 },
  // BARMM
  'BASILAN': { lat: 6.5833, lng: 121.9667 },
  'LANAO_DEL_SUR': { lat: 7.8333, lng: 124.3333 },
  'MAGUINDANAO_DEL_NORTE': { lat: 7.1500, lng: 124.2500 },
  'MAGUINDANAO_DEL_SUR': { lat: 6.9500, lng: 124.3000 },
  'SULU': { lat: 5.9667, lng: 121.0333 },
  'TAWI_TAWI': { lat: 5.1667, lng: 120.0833 }
};

interface MapPoint {
  _id: string;
  cooperativeName: string;
  registrationNumber: string;
  cooperativeType: string;
  cooperativeCluster: string;
  status: string;
  complianceStatus?: string;
  region?: string;
  province?: string;
  municipality?: string;
  street?: string;
  category?: string;
  assetSize2025?: string;
  assetSize2026?: string;
  // Dynamic mapped coords
  coords?: { lat: number; lng: number };
}

interface MapVisualizerProps {
  user: any;
  token: string | null;
}

export default function MapVisualizer({ user, token }: MapVisualizerProps) {
  // -------------------------------------------------------------
  // MAP STATE
  // -------------------------------------------------------------
  const [points, setPoints] = useState<MapPoint[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorLoading, setErrorLoading] = useState<string | null>(null);
  const [authFailed, setAuthFailed] = useState(false);

  // Catch Maps authentication failure (InvalidKeyMapError etc.)
  useEffect(() => {
    const originalAuthFailure = (window as any).gm_authFailure;
    (window as any).gm_authFailure = () => {
      setAuthFailed(true);
      if (originalAuthFailure) {
        try { originalAuthFailure(); } catch (e) {}
      }
    };
    return () => {
      (window as any).gm_authFailure = originalAuthFailure;
    };
  }, []);
  
  // Center: Philippines general center (12.8797, 121.7740)
  const defaultCenter = { lat: 12.8797, lng: 121.7740 };
  const [mapCenter, setMapCenter] = useState(defaultCenter);
  const [mapZoom, setMapZoom] = useState(6);
  
  // Customization switchers
  const [colorScheme, setColorScheme] = useState<'status' | 'compliance' | 'cluster'>('compliance');
  const [panelViewMode, setPanelViewMode] = useState<'sidebar' | 'compact'>('sidebar');

  // Filters State
  const [statusFilter, setStatusFilter] = useState('');
  const [complianceFilter, setComplianceFilter] = useState('');
  const [coopTypeFilter, setCoopTypeFilter] = useState('');
  const [clusterFilter, setClusterFilter] = useState('');
  const [regionFilter, setRegionFilter] = useState(user?.role === 'Regional Office Evaluator' ? user?.region || '' : '');
  const [provinceFilter, setProvinceFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Active selected marker (Anchor pattern)
  const [selectedPointRef, selectedPointElement] = useAdvancedMarkerRef();
  const [activePoint, setActivePoint] = useState<MapPoint | null>(null);

  // Dynamic Provinces selection (Filtered by selected Region)
  const availableProvinces = useMemo(() => {
    if (!regionFilter) return PHILIPPINE_PROVINCES;
    return PHILIPPINE_PROVINCES.filter(p => p.regionId === regionFilter);
  }, [regionFilter]);

  // Handle region filter change resets province
  const handleRegionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setRegionFilter(e.target.value);
    setProvinceFilter('');
  };

  // -------------------------------------------------------------
  // LOAD & TRANSFORM POINTS (WITH JITTERING)
  // -------------------------------------------------------------
  const loadPoints = async () => {
    setIsLoading(true);
    setErrorLoading(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      if (complianceFilter) params.append('complianceStatus', complianceFilter);
      if (coopTypeFilter) params.append('cooperativeType', coopTypeFilter);
      if (clusterFilter) params.append('cooperativeCluster', clusterFilter);
      if (regionFilter) params.append('region', regionFilter);
      if (provinceFilter) params.append('province', provinceFilter);
      if (categoryFilter) params.append('category', categoryFilter);
      if (searchTerm) params.append('search', searchTerm);

      const res = await apiRequest(`/api/reports/map-points?${params.toString()}`);
      if (!res.ok) {
        throw new Error('Could not fetch cooperative coordinates.');
      }
      const data: MapPoint[] = await res.json();
      
      // Jitter allocation dictionary to offset stacked items in same geographic space
      const coordinateCountMap: Record<string, number> = {};

      const transformed = data.map((item, index) => {
        let baseCoords = { ...defaultCenter };

        // 1. Matches province centroid
        if (item.province) {
          const provKey = String(item.province).toUpperCase().replace(/\s+/g, '_').replace(/[\.,]/g, '');
          if (PROVINCE_COORDS[provKey]) {
            baseCoords = { ...PROVINCE_COORDS[provKey] };
          } else {
            // Find fuzzy matches
            const fuzzyProv = Object.keys(PROVINCE_COORDS).find(k => 
              k.includes(provKey) || provKey.includes(k)
            );
            if (fuzzyProv) baseCoords = { ...PROVINCE_COORDS[fuzzyProv] };
          }
        } 
        
        // 2. Matches region centroid if no province match found
        if ((baseCoords.lat === defaultCenter.lat && baseCoords.lng === defaultCenter.lng) && item.region) {
          const regInfo = PHILIPPINE_REGIONS.find(r => r.id === item.region || r.code === item.region);
          if (regInfo && REGION_COORDS[regInfo.id]) {
            baseCoords = { ...REGION_COORDS[regInfo.id] };
          }
        }

        // 3. Jitter algorithm: disperses stacked centroids so multiple coops are simultaneously visual!
        const coordKey = `${baseCoords.lat.toFixed(4)}_${baseCoords.lng.toFixed(4)}`;
        const count = coordinateCountMap[coordKey] || 0;
        coordinateCountMap[coordKey] = count + 1;

        if (count > 0) {
          // Compute circular offset based on index (Fibonacci spiral or circle layout)
          const angle = (count * 0.42) * Math.PI; 
          const radius = 0.015 + (Math.floor(count / 10) * 0.008); // expand circle radius if stack grows
          baseCoords.lat += Math.sin(angle) * radius;
          baseCoords.lng += Math.cos(angle) * radius;
        }

        return {
          ...item,
          coords: baseCoords
        };
      });

      setPoints(transformed);

      // Auto-center map to the first plotted item to look dynamic
      if (transformed.length > 0) {
        const firstWithCoords = transformed.find(p => p.coords);
        if (firstWithCoords && firstWithCoords.coords) {
          setMapCenter(firstWithCoords.coords);
          setMapZoom(selectedRegionZoom(regionFilter));
        }
      }
    } catch (err: any) {
      console.error('Error fetching points for maps:', err);
      setErrorLoading(err?.message || 'Failed to complete map points request.');
    } finally {
      setIsLoading(false);
    }
  };

  // Helper to adjust zoom level depending on regional filter magnitude
  const selectedRegionZoom = (reg: string) => {
    if (!reg) return 6; // National level
    if (reg === 'NCR') return 11; // High zoom for Metro Manila
    return 8; // Regional zoom
  };

  useEffect(() => {
    if (hasValidKey) {
      loadPoints();
    }
  }, [statusFilter, complianceFilter, coopTypeFilter, clusterFilter, regionFilter, provinceFilter, categoryFilter]);

  // Trigger load on debounced search or manual click
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadPoints();
  };

  const handleResetFilters = () => {
    setStatusFilter('');
    setComplianceFilter('');
    setCoopTypeFilter('');
    setClusterFilter('');
    setRegionFilter(user?.role === 'Regional Office Evaluator' ? user?.region || '' : '');
    setProvinceFilter('');
    setCategoryFilter('');
    setSearchTerm('');
  };

  // -------------------------------------------------------------
  // DYNAMIC COLOR REPRESENTATION
  // -------------------------------------------------------------
  const getMarkerColors = (point: MapPoint) => {
    if (colorScheme === 'status') {
      switch (point.status) {
        case 'Approved':
          return { bg: '#22c55e', text: '#ffffff', label: 'Approved' };
        case 'Rejected':
          return { bg: '#ef4444', text: '#ffffff', label: 'Rejected' };
        default:
          return { bg: '#f59e0b', text: '#ffffff', label: 'Pending' };
      }
    } else if (colorScheme === 'compliance') {
      const cStatus = point.complianceStatus || 'No Record';
      if (cStatus.includes('Issued COC')) {
        return { bg: '#10b981', text: '#ffffff', label: 'Issued COC' };
      } else if (cStatus.includes('Under Evaluation')) {
        return { bg: '#3b82f6', text: '#ffffff', label: 'Under Evaluation' };
      } else if (cStatus.includes('Non-Compliant') || cStatus.includes('Not Complying')) {
        return { bg: '#f43f5e', text: '#ffffff', label: 'Non-Compliant' };
      } else {
        return { bg: '#64748b', text: '#ffffff', label: 'Pending Assessment' };
      }
    } else {
      // Cooperative Clusters
      switch (point.cooperativeCluster) {
        case 'Credit and Financial Services, Banking, Credit Surety Fund and Insurance':
        case 'financial':
          return { bg: '#8b5cf6', text: '#ffffff', label: 'Financial' };
        case 'Consumers, Marketing, Producers, and Logistics':
        case 'consumers_marketing':
          return { bg: '#f97316', text: '#ffffff', label: 'Consumers/Producers' };
        case 'Education and Advocacy':
        case 'education_advocacy':
          return { bg: '#06b6d4', text: '#ffffff', label: 'Education' };
        case 'Human Services: Health, Housing, Workers, and Labor Service':
        case 'human_services':
          return { bg: '#ec4899', text: '#ffffff', label: 'Human Services' };
        case 'Agriculture, Agrarian, Aquaculture, Farmers, Dairy, and Fisherfolk':
        case 'agriculture':
          return { bg: '#10b981', text: '#ffffff', label: 'Agriculture' };
        case 'Public Utilities: Electricity, Water, Communications, and Transport':
        case 'utilities':
          return { bg: '#eab308', text: '#020617', label: 'Public Utilities' };
        default:
          return { bg: '#64748b', text: '#ffffff', label: 'Unclassified' };
      }
    }
  };

  // Center view on clicked sidebar entry
  const selectPlottedCoop = (pt: MapPoint) => {
    if (pt.coords) {
      setMapCenter(pt.coords);
      setMapZoom(12);
      setActivePoint(pt);
    }
  };

  // Render Setup Splash Screen when Google Maps API Key is missing or invalid
  if (!hasValidKey || authFailed) {
    return (
      <div className="min-h-[85vh] flex items-center justify-center bg-slate-900 border border-slate-800 rounded-3xl p-6 text-slate-100 shadow-2xl relative overflow-hidden">
        {/* Background Ambient Glow */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-xl bg-slate-800/80 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-8 text-center relative z-10 shadow-xl">
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-6 text-red-400">
            <Compass className={authFailed ? "text-red-400" : "animate-spin-slow text-blue-400"} size={32} />
          </div>
          
          <h2 className="text-2xl font-bold tracking-tight text-white mb-2">
            {authFailed ? "Google Maps API Key Authentication Error" : "Google Maps Integration Required"}
          </h2>
          <p className="text-slate-300 text-sm mb-6 leading-relaxed">
            {authFailed 
              ? "The Google Maps API rejected the active key with an InvalidKeyMapError. This usually occurs because the key is incorrect, has expired, contains restricted credentials, or the Maps JavaScript API is not enabled on your Google Cloud Console project."
              : "The database of registered cooperatives is ready for geographic mapping visualization. Pls add your Google Maps API key to activate the interactive canvas."}
          </p>

          <div className="text-left space-y-4 mb-8 bg-slate-900/60 p-5 rounded-xl border border-slate-800">
            <div>
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-blue-900/50 text-blue-400 text-xs font-bold mr-2 border border-blue-800/40">1</span>
              <a 
                href="https://console.cloud.google.com/google/maps-apis/start?utm_campaign=gmp-code-assist-ais" 
                target="_blank" 
                rel="noopener"
                className="text-blue-400 font-medium hover:underline text-sm inline-flex items-center gap-1"
              >
                Get or Verify your API key <Compass size={14} />
              </a>
            </div>

            <div>
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-blue-900/50 text-blue-400 text-xs font-bold mr-2 border border-blue-800/40">2</span>
              <span className="text-slate-300 text-sm">
                Make sure to enable <strong>Maps JavaScript API</strong> in your Google Cloud Console for this key.
              </span>
            </div>

            <div>
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-blue-900/50 text-blue-400 text-xs font-bold mr-2 border border-blue-800/40">3</span>
              <span className="text-slate-300 text-sm">
                Open <strong>Settings</strong> (⚙️ gear icon, top-right) &rarr; <strong>Secrets</strong> &rarr; enter <code>GOOGLE_MAPS_PLATFORM_KEY</code> as secret name &rarr; enter your key value &rarr; click save.
              </span>
            </div>
          </div>

          <div className="text-slate-400 text-xs border-t border-slate-700/40 pt-4 flex items-center justify-center gap-2">
            <AlertCircle size={14} className="text-yellow-500" />
            The CDA system compiles automatically immediately upon secret binding.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* -------------------------------------------------------------
          TOP BAR HEADER & ACTIONS
         ------------------------------------------------------------- */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-slate-900/60 border border-slate-800/80 backdrop-blur-md p-4 rounded-2xl">
        <div>
          <div className="flex items-center gap-2 text-blue-400 text-xs font-semibold uppercase tracking-wider mb-1">
            <Sparkles size={12} />
            CDA Geo-Spatial Analysis
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <MapIcon className="text-blue-500" size={22} />
            Cooperative Geographic Information System (GIS)
          </h1>
        </div>

        <div className="flex items-center gap-2 self-start md:self-center">
          {/* Legend Color Toggler */}
          <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button 
              onClick={() => setColorScheme('compliance')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                colorScheme === 'compliance' 
                  ? 'bg-blue-600 text-white shadow-md' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Compliance
            </button>
            <button 
              onClick={() => setColorScheme('status')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                colorScheme === 'status' 
                  ? 'bg-blue-600 text-white shadow-md' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Evaluation
            </button>
            <button 
              onClick={() => setColorScheme('cluster')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                colorScheme === 'cluster' 
                  ? 'bg-blue-600 text-white shadow-md' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Cluster
            </button>
          </div>

          <button 
            onClick={loadPoints}
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
            title="Refresh Map Data"
          >
            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* -------------------------------------------------------------
          FILTER CONTROLS
         ------------------------------------------------------------- */}
      <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
            <input 
              type="text"
              placeholder="Search by cooperative name or registration code..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 text-slate-100 text-sm pl-10 pr-4 py-2.5 rounded-xl border border-slate-800 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-slate-600"
            />
          </div>
          <button 
            type="submit" 
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm rounded-xl transition shadow-md flex items-center gap-2"
          >
            Search
          </button>
        </form>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
          {/* Region selector */}
          <div className="space-y-1">
            <label className="text-slate-400 text-xs font-medium">Region</label>
            <select
              value={regionFilter}
              onChange={handleRegionChange}
              disabled={user?.role === 'Regional Office Evaluator'}
              className="w-full text-xs text-slate-200 bg-slate-950 px-3 py-2 rounded-lg border border-slate-800 focus:outline-none focus:border-blue-500 disabled:opacity-60"
            >
              <option value="">All Regions</option>
              {PHILIPPINE_REGIONS.map(reg => (
                <option key={reg.id} value={reg.id}>{reg.id} - {reg.name.split(' (')[0]}</option>
              ))}
            </select>
          </div>

          {/* Province selector */}
          <div className="space-y-1">
            <label className="text-slate-400 text-xs font-medium">Province</label>
            <select
              value={provinceFilter}
              onChange={(e) => setProvinceFilter(e.target.value)}
              className="w-full text-xs text-slate-200 bg-slate-950 px-3 py-2 rounded-lg border border-slate-800 focus:outline-none focus:border-blue-500"
            >
              <option value="">All Provinces</option>
              {availableProvinces.map(prov => (
                <option key={prov.id} value={prov.name}>{prov.name}</option>
              ))}
            </select>
          </div>

          {/* Cooperative Type */}
          <div className="space-y-1">
            <label className="text-slate-400 text-xs font-medium">Coop Type</label>
            <select
              value={coopTypeFilter}
              onChange={(e) => setCoopTypeFilter(e.target.value)}
              className="w-full text-xs text-slate-200 bg-slate-950 px-3 py-2 rounded-lg border border-slate-800 focus:outline-none focus:border-blue-500"
            >
              <option value="">All Types</option>
              {ALL_COOP_TYPES.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          {/* Cooperative Cluster */}
          <div className="space-y-1">
            <label className="text-slate-400 text-xs font-medium">Cluster</label>
            <select
              value={clusterFilter}
              onChange={(e) => setClusterFilter(e.target.value)}
              className="w-full text-xs text-slate-200 bg-slate-950 px-3 py-2 rounded-lg border border-slate-800 focus:outline-none focus:border-blue-500"
            >
              <option value="">All Clusters</option>
              {COOPERATIVE_CLUSTERS.map(cluster => (
                <option key={cluster.id} value={cluster.name}>{cluster.name.substring(0, 30)}...</option>
              ))}
            </select>
          </div>

          {/* Compliance Status */}
          <div className="space-y-1">
            <label className="text-slate-400 text-xs font-medium">Compliance</label>
            <select
              value={complianceFilter}
              onChange={(e) => setComplianceFilter(e.target.value)}
              className="w-full text-xs text-slate-200 bg-slate-950 px-3 py-2 rounded-lg border border-slate-800 focus:outline-none focus:border-blue-500"
            >
              <option value="">All Compliance</option>
              <option value="Issued COC">Issued COC</option>
              <option value="Under Evaluation">Under Evaluation</option>
              <option value="Non-Compliant">Non-Compliant</option>
              <option value="Not Complying">Not Complying</option>
            </select>
          </div>

          {/* Category size selector */}
          <div className="space-y-1">
            <label className="text-slate-400 text-xs font-medium">Assessed Category</label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full text-xs text-slate-200 bg-slate-950 px-3 py-2 rounded-lg border border-slate-800 focus:outline-none focus:border-blue-500"
            >
              <option value="">All Asset Sizes</option>
              <option value="Micro">Micro (&lt; 3M)</option>
              <option value="Small">Small (3M - 15M)</option>
              <option value="Medium">Medium (15M - 100M)</option>
              <option value="Large">Large (&gt; 100M)</option>
            </select>
          </div>
        </div>

        <div className="flex justify-between items-center pt-2 border-t border-slate-800">
          <div className="text-xs text-slate-400">
            Plotted {isLoading ? '...' : points.length} cooperative locations meeting active parameters
          </div>
          <button 
            onClick={handleResetFilters}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition"
          >
            <RotateCcw size={12} />
            Reset Filters
          </button>
        </div>
      </div>

      {/* -------------------------------------------------------------
          MAIN COMPONENT BODY (MAP CANVAS & SIDEBAR LIST)
         ------------------------------------------------------------- */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 min-h-[600px]">
        {/* Plotted list sidebar (xl:col-span-1) */}
        <div className="xl:col-span-1 flex flex-col bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden max-h-[650px]">
          <div className="p-4 bg-slate-950 border-b border-slate-800 flex justify-between items-center">
            <span className="text-xs font-bold text-slate-300 uppercase letter tracking-wider flex items-center gap-1.5">
              <List size={14} className="text-blue-500" />
              Location Plotted Directory
            </span>
            <span className="px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-[10px] text-blue-400 font-bold">
              {points.length} Coops
            </span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60 p-2 space-y-2.5 scrollbar-thin scrollbar-thumb-white/5">
            {points.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-xs">
                {isLoading ? (
                  <div className="space-y-2">
                    <RefreshCw className="animate-spin mx-auto text-blue-500" size={24} />
                    <p>Loading database records...</p>
                  </div>
                ) : (
                  <p>No plotted entries match filtered criteria.</p>
                )}
              </div>
            ) : (
              points.map((pt) => {
                const colors = getMarkerColors(pt);
                const isActive = activePoint?._id === pt._id;

                return (
                  <div
                    key={pt._id}
                    onClick={() => selectPlottedCoop(pt)}
                    className={`p-3 rounded-xl cursor-pointer text-left transition-all border ${
                      isActive 
                        ? 'bg-blue-600/10 border-blue-500 shadow-lg' 
                        : 'bg-slate-950/40 border-slate-800/40 hover:bg-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex justify-between items-start gap-1.5">
                      <span className="text-[10px] uppercase font-mono tracking-wider font-extrabold text-blue-400">
                        {pt.cooperativeType}
                      </span>
                      <span 
                        className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase shrink-0"
                        style={{ backgroundColor: `${colors.bg}15`, color: colors.bg, border: `1px solid ${colors.bg}30` }}
                      >
                        {colors.label}
                      </span>
                    </div>

                    <h4 className="text-xs font-bold text-slate-100 mt-1 line-clamp-1">
                      {pt.cooperativeName}
                    </h4>

                    <div className="mt-2 space-y-0.5 text-[10px] text-slate-400">
                      <p className="flex items-center gap-1">
                        <MapPin size={10} className="text-slate-600 text-shrink-0" />
                        <span className="truncate">
                          {pt.municipality ? `${pt.municipality}, ` : ''}{pt.province || 'Unknown Province'}
                        </span>
                      </p>
                      <p className="flex items-center gap-1">
                        <Building2 size={10} className="text-slate-600" />
                        <span>Reg No: {pt.registrationNumber}</span>
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Google Maps Stage (xl:col-span-3) */}
        <div className="xl:col-span-3 h-[650px] relative rounded-2xl overflow-hidden border border-slate-800 bg-slate-900 shadow-inner">
          <APIProvider apiKey={API_KEY} version="weekly">
            <Map
              center={mapCenter}
              zoom={mapZoom}
              onCenterChanged={(ev) => setMapCenter(ev.detail.center)}
              onZoomChanged={(ev) => setMapZoom(ev.detail.zoom)}
              mapId="DEDICATED_CDA_MAP_ID"
              internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
              style={{ width: '100%', height: '100%' }}
              disableDefaultUI={false}
              gestureHandling="cooperative"
            >
              {points.map((pt) => {
                if (!pt.coords) return null;
                const colors = getMarkerColors(pt);
                const isSelected = activePoint?._id === pt._id;

                return (
                  <AdvancedMarker
                    key={pt._id}
                    position={pt.coords}
                    onClick={() => setActivePoint(pt)}
                    title={pt.cooperativeName}
                  >
                    <Pin 
                      background={colors.bg} 
                      borderColor={isSelected ? '#ffffff' : colors.bg} 
                      glyphColor={colors.text}
                      scale={isSelected ? 1.3 : 0.95}
                    />
                  </AdvancedMarker>
                );
              })}

              {activePoint && activePoint.coords && (
                <InfoWindow
                  position={activePoint.coords}
                  onCloseClick={() => setActivePoint(null)}
                >
                  <div className="text-slate-900 p-1 max-w-[280px]">
                    <div className="flex justify-between items-start gap-2 mb-1 border-b border-gray-100 pb-1.5">
                      <span className="text-[9px] font-mono whitespace-nowrap bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-extrabold uppercase">
                        {activePoint.cooperativeType}
                      </span>
                      <span 
                        className="text-[9px] font-bold px-1.5 py-0.5 uppercase tracking-wider rounded border"
                        style={{ 
                          backgroundColor: `${getMarkerColors(activePoint).bg}15`, 
                          color: getMarkerColors(activePoint).bg,
                          borderColor: `${getMarkerColors(activePoint).bg}40`
                        }}
                      >
                        {getMarkerColors(activePoint).label}
                      </span>
                    </div>

                    <h3 className="text-xs font-bold font-sans text-gray-900 leading-tight">
                      {activePoint.cooperativeName}
                    </h3>
                    
                    <p className="text-[10px] font-sans font-medium text-slate-500 mt-1">
                      Registration: <span className="font-mono font-semibold text-slate-800">{activePoint.registrationNumber}</span>
                    </p>

                    <p className="text-[10px] text-gray-700 mt-2 flex items-start gap-1 font-sans leading-snug">
                      <MapPin size={11} className="text-blue-600 mt-0.5 shrink-0" />
                      <span>
                        {[activePoint.street, activePoint.municipality, activePoint.province, activePoint.region]
                          .filter(Boolean)
                          .join(', ')}
                      </span>
                    </p>

                    <div className="mt-3.5 space-y-1 bg-slate-50 p-2 rounded-lg border border-slate-100 text-[9px]">
                      {activePoint.category && (
                        <p className="flex justify-between text-slate-600">
                          <span>Asset Classification:</span>
                          <span className="font-bold text-slate-800">{activePoint.category} Size</span>
                        </p>
                      )}
                      {activePoint.assetSize2025 && (
                        <p className="flex justify-between text-slate-600">
                          <span>2025 Asset size:</span>
                          <span className="font-bold text-slate-800">₱{Number(activePoint.assetSize2025).toLocaleString()}</span>
                        </p>
                      )}
                      {activePoint.assetSize2026 && (
                        <p className="flex justify-between text-slate-600">
                          <span>2026 Asset size:</span>
                          <span className="font-bold text-slate-800">₱{Number(activePoint.assetSize2026).toLocaleString()}</span>
                        </p>
                      )}
                    </div>
                  </div>
                </InfoWindow>
              )}
            </Map>
          </APIProvider>

          {/* Scheme Legend Overlay (Desktop-friendly bottom left) */}
          <div className="absolute bottom-5 left-5 bg-slate-950/95 backdrop-blur-md border border-slate-800 p-3.5 rounded-xl text-slate-100 text-xs shadow-2xl relative z-10 max-w-[280px]">
            <h4 className="font-bold text-[10px] uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5 border-b border-slate-800 pb-1.5">
              <Layers size={11} className="text-blue-400" />
              GIS Color Index Map
            </h4>

            <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-1 scrollbar-thin">
              {colorScheme === 'compliance' && (
                <>
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#10b981]" />
                    <span className="text-[10px] text-slate-300">Issued COC (Compliant)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#3b82f6]" />
                    <span className="text-[10px] text-slate-300">Under Active Evaluation</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#f43f5e]" />
                    <span className="text-[10px] text-slate-300">Non-Compliant</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#64748b]" />
                    <span className="text-[10px] text-slate-300">Pending Evaluation Review</span>
                  </div>
                </>
              )}

              {colorScheme === 'status' && (
                <>
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#22c55e]" />
                    <span className="text-[10px] text-slate-300">Formally Approved</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#ef4444]" />
                    <span className="text-[10px] text-slate-300">Formally Rejected</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#f59e0b]" />
                    <span className="text-[10px] text-slate-300">Under Review (Pending)</span>
                  </div>
                </>
              )}

              {colorScheme === 'cluster' && (
                <>
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#8b5cf6]" />
                    <span className="text-[10px] text-slate-300">Credit & Financial</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#f97316]" />
                    <span className="text-[10px] text-slate-300">Consumers & Producers</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#06b6d4]" />
                    <span className="text-[10px] text-slate-300">Education & Advocacy</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#ec4899]" />
                    <span className="text-[10px] text-slate-300">Human Services / Labor</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#10b981]" />
                    <span className="text-[10px] text-slate-300">Agrarian / Agriculture</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#eab308]" />
                    <span className="text-[10px] text-slate-300">Electricity / Utilities</span>
                  </div>
                </>
              )}
            </div>
            
            <div className="mt-2 text-[9px] text-slate-500 border-t border-slate-800 pt-1.5">
              Marker colors switch automatically using the header toggler options.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
