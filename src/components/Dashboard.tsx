import React, { useState, useEffect, useRef } from 'react';
import { User, DashboardStats, UserRole } from '../types.ts';
import { 
  FileUp, BarChart3, Users, Clock, ShieldCheck, UserPlus, 
  Lock, Loader2, X, ShieldAlert, MapPin, LayoutDashboard,
  FileText, History, Settings, LogOut, Terminal, 
  CheckCircle2, AlertTriangle, Shield, Eye, Trash2, 
  UserMinus, UserCheck, Edit2, Bell, Copy, RefreshCw, Search, Layers,
  Menu, Sun, Moon, Download, Wrench, Layout, Filter, Check, Plus,
  Sparkles, Wand2, ChevronLeft, ChevronRight, Save
} from 'lucide-react';
import { FuturisticLoader } from './FuturisticLoader.tsx';
import { motion, AnimatePresence } from 'motion/react';
import { PHILIPPINE_REGIONS, PHILIPPINE_PROVINCES, COOPERATIVE_CLUSTERS, ALL_COOP_TYPES } from '../constants.ts';
import { apiRequest } from '../lib/api.ts';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

import { generateSummaryReport, generateEvaluationReport, generateCustomReport } from '../services/reportService.ts';
import MapVisualizer from './MapVisualizer.tsx';

interface Props {
  user: User | null;
  token: string | null;
  onLogout: () => void;
}

export default function Dashboard({ user, token, onLogout }: Props) {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'reports' | 'users' | 'ingest' | 'audit' | 'settings' | 'builder' | 'map'>('dashboard');
  const [analysisData, setAnalysisData] = useState<{complianceStats: any[], regionStats: any[]} | null>(null);
  const [isAnalysisLoading, setIsAnalysisLoading] = useState(false);
  const [selectedBuilderFields, setSelectedBuilderFields] = useState<string[]>(['cooperativeName', 'registrationNumber', 'region', 'status', 'complianceStatus']);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadTimeLeft, setUploadTimeLeft] = useState<number | null>(null);
  const [uploadMessage, setUploadMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  
  // Ingest state
  const [ingestStep, setIngestStep] = useState<'upload' | 'map'>('upload');
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvPreview, setCsvPreview] = useState<any[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({
    cooperativeName: '',
    registrationNumber: '',
    reportType: '',
    submissionDate: '',
    region: '',
    province: '',
    municipality: '',
    street: '',
    category: '',
    assetSize2025: '',
    assetSize2026: '',
    statusOfCompliance: '',
    statusDetails: '',
    status: ''
  });
  const [autoMappedFields, setAutoMappedFields] = useState<Set<string>>(new Set());

  const [isAddingCoop, setIsAddingCoop] = useState(false);
  const [showSecondaryType, setShowSecondaryType] = useState(false);
  const [newCoop, setNewCoop] = useState({
    cooperativeName: '',
    registrationNumber: '',
    cooperativeType: '',
    secondaryCooperativeType: '',
    specificType: '',
    cooperativeCluster: '',
    secondaryCooperativeCluster: '',
    region: user?.region || '',
    province: '',
    municipality: '',
    street: '',
    category: '',
    assetSize2025: '',
    assetSize2026: '',
    status: 'Complied'
  });

  const [showPasswordChange, setShowPasswordChange] = useState(user?.mustChangePassword || false);
  const [newPassword, setNewPassword] = useState('');
  const [passLoading, setPassLoading] = useState(false);

  const [users, setUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [newUser, setNewUser] = useState({
    email: '',
    displayName: '',
    role: UserRole.ANALYST,
    region: user?.region || ''
  });
  const [userActionLoading, setUserActionLoading] = useState(false);
  const [createdUserTempPass, setCreatedUserTempPass] = useState<{ email: string, pass: string } | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<User | null>(null);
  const [showUpdateConfirm, setShowUpdateConfirm] = useState(false);
  const [editFormData, setEditFormData] = useState({ displayName: '', role: UserRole.ANALYST, region: '' });

  const [reports, setReports] = useState<any[]>([]);
  const [selectedReport, setSelectedReport] = useState<any | null>(null);
  const [reportHistory, setReportHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyTargetReport, setHistoryTargetReport] = useState<any | null>(null);
  const [reportPage, setReportPage] = useState(1);
  const [reportTotal, setReportTotal] = useState(0);
  const [reportPages, setReportPages] = useState(1);
  const [reportStatusFilter, setReportStatusFilter] = useState('');
  const [reportComplianceFilter, setReportComplianceFilter] = useState('');
  const [reportRegionFilter, setReportRegionFilter] = useState('');
  const [reportProvinceFilter, setReportProvinceFilter] = useState('');
  const [reportCooperativeTypeFilter, setReportCooperativeTypeFilter] = useState('');
  const [reportCooperativeClusterFilter, setReportCooperativeClusterFilter] = useState('');
  const [isSyncingClusters, setIsSyncingClusters] = useState(false);
  const [reportSortBy, setReportSortBy] = useState('createdAt');
  const [reportSortOrder, setReportSortOrder] = useState<'asc' | 'desc'>('desc');
  const [reportSearch, setReportSearch] = useState('');
  const [searchInputValue, setSearchInputValue] = useState('');

  // Hydrate search input from URL on mount (after a short delay to let mount effects finish)
  useEffect(() => {
    setSearchInputValue(reportSearch);
  }, [reportSearch === '']); // Only sync once on init or reset
  const [expandedReportId, setExpandedReportId] = useState<string | null>(null);

  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme');
      if (saved) return saved === 'dark';
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditPage, setAuditPage] = useState(1);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditPages, setAuditPages] = useState(1);

  useEffect(() => {
    // Sync URL params to state on mount
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    if (tabParam && ['dashboard', 'reports', 'users', 'ingest', 'audit', 'settings'].includes(tabParam)) {
      setActiveTab(tabParam as any);
    }

    const statusParam = params.get('status');
    if (statusParam) setReportStatusFilter(statusParam);

    const complianceParam = params.get('complianceStatus');
    if (complianceParam) setReportComplianceFilter(complianceParam);

    const regionParam = params.get('region');
    if (regionParam) setReportRegionFilter(regionParam);

    const provinceParam = params.get('province');
    if (provinceParam) setReportProvinceFilter(provinceParam);

    const coopTypeParam = params.get('cooperativeType');
    if (coopTypeParam) setReportCooperativeTypeFilter(coopTypeParam);

    const pageParam = params.get('page');
    if (pageParam) setReportPage(parseInt(pageParam) || 1);

    const sortParam = params.get('sortBy');
    if (sortParam) setReportSortBy(sortParam);

    const orderParam = params.get('order');
    if (orderParam && (orderParam === 'asc' || orderParam === 'desc')) setReportSortOrder(orderParam as 'asc' | 'desc');

    const searchParam = params.get('search');
    if (searchParam) {
      setReportSearch(searchParam);
      setSearchInputValue(searchParam);
    }
  }, []);

  useEffect(() => {
    const handler = setTimeout(() => {
      if (searchInputValue !== reportSearch) {
        setReportSearch(searchInputValue);
        setReportPage(1);
      }
    }, 500); // 500ms debounce
    return () => clearTimeout(handler);
  }, [searchInputValue, reportSearch]);

  const [emailStatus, setEmailStatus] = useState<{ isReady: boolean, lastError: string | null, helpMessage?: string | null, config: any } | null>(null);
  const [isVerifyingEmail, setIsVerifyingEmail] = useState(false);

  // SMTP Configuration form state
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [smtpFrom, setSmtpFrom] = useState('');
  const [smtpSecure, setSmtpSecure] = useState('false');
  const [smtpService, setSmtpService] = useState('');
  const [isSavingSmtp, setIsSavingSmtp] = useState(false);

  const fetchEmailStatus = async () => {
    try {
      const response = await apiRequest('/api/settings/email-status');
      if (response.ok) {
        const data = await response.json();
        setEmailStatus(data);
        if (data && data.config) {
          setSmtpHost(data.config.host || '');
          setSmtpPort(data.config.port || '587');
          setSmtpUser(data.config.user || '');
          setSmtpFrom(data.config.from || '');
          setSmtpSecure(String(data.config.secure || 'false'));
          setSmtpService(data.config.service || '');
          setSmtpPass(data.config.hasPassword ? '••••••••' : '');
        }
      }
    } catch (error: any) {
      if (error && error.message !== 'Session expired' && !error.isNetworkError) {
        console.error('Fetch email status error:', error);
      }
    }
  };

  const handleSaveSmtpSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingSmtp(true);
    try {
      const response = await apiRequest('/api/settings/smtp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          host: smtpHost,
          port: smtpPort,
          user: smtpUser,
          pass: smtpPass,
          from: smtpFrom,
          secure: smtpSecure,
          service: smtpService
        })
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setEmailStatus(data.status);
        if (data.status && data.status.config) {
          setSmtpPass(data.status.config.hasPassword ? '••••••••' : '');
        }
        setUploadMessage({ type: 'success', text: 'SMTP configurations saved and tested successfully!' });
      } else {
        setUploadMessage({ type: 'error', text: data.message || 'Failed to update SMTP configurations.' });
      }
    } catch (err) {
      console.error('Error saving SMTP settings:', err);
      setUploadMessage({ type: 'error', text: 'An unexpected network error occurred while saving SMTP settings.' });
    } finally {
      setIsSavingSmtp(false);
      setTimeout(() => setUploadMessage(null), 5000);
    }
  };

  const handleVerifyEmail = async () => {
    setIsVerifyingEmail(true);
    try {
      const response = await apiRequest('/api/settings/email-verify', { method: 'POST' });
      const data = await response.json();
      
      if (data.status) {
        setEmailStatus(data.status);
        if (data.status.config) {
          setSmtpPass(data.status.config.hasPassword ? '••••••••' : '');
        }
      }
      
      if (response.ok && data.success) {
        setUploadMessage({ type: 'success', text: 'Email SMTP connection verified successfully.' });
      } else {
        setUploadMessage({ type: 'error', text: data.status?.lastError || 'Email verification failed.' });
      }
    } catch (error) {
      setUploadMessage({ type: 'error', text: 'Error triggering email verification.' });
    } finally {
      setIsVerifyingEmail(false);
      setTimeout(() => setUploadMessage(null), 5000);
    }
  };

  useEffect(() => {
    if (user?.role === UserRole.ADMIN) {
      fetchEmailStatus();
    }
  }, [user]);

  useEffect(() => {
    // Sync state to URL params
    const params = new URLSearchParams(window.location.search);
    params.set('tab', activeTab);
    
    if (activeTab === 'reports') {
      if (reportStatusFilter) params.set('status', reportStatusFilter);
      else params.delete('status');

      if (reportComplianceFilter) params.set('complianceStatus', reportComplianceFilter);
      else params.delete('complianceStatus');

      if (reportRegionFilter) params.set('region', reportRegionFilter);
      else params.delete('region');

      if (reportProvinceFilter) params.set('province', reportProvinceFilter);
      else params.delete('province');

      if (reportCooperativeTypeFilter) params.set('cooperativeType', reportCooperativeTypeFilter);
      else params.delete('cooperativeType');

      if (reportPage > 1) params.set('page', reportPage.toString());
      else params.delete('page');

      if (reportSortBy !== 'createdAt') params.set('sortBy', reportSortBy);
      else params.delete('sortBy');

      if (reportSortOrder !== 'desc') params.set('order', reportSortOrder);
      else params.delete('order');

      if (reportSearch) params.set('search', reportSearch);
      else params.delete('search');
    } else {
      // Clear report filters from URL if not on reports tab for a cleaner URL, 
      // or keep them if we want to preserve state across refreshes even if not active.
      // Preservation is usually better.
    }

    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, '', newUrl);
  }, [activeTab, reportStatusFilter, reportComplianceFilter, reportRegionFilter, reportProvinceFilter, reportPage, reportSortBy, reportSortOrder]);

  const handleToggleStatus = async (targetUser: User) => {
    setUserActionLoading(true);
    try {
      const res = await apiRequest(`/api/auth/users/${targetUser._id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ isActive: !targetUser.isActive })
      });
      
      const data = await res.json();
      if (res.ok) {
        setUploadMessage({ type: 'success', text: data.message });
        fetchUsers();
      } else {
        setUploadMessage({ type: 'error', text: data.message });
      }
    } catch (err) {
      setUploadMessage({ type: 'error', text: 'Network error or session expired' });
    } finally {
      setUserActionLoading(false);
    }
  };

  const handleDeleteUser = async (id: string) => {
    setUserActionLoading(true);
    try {
      const res = await apiRequest(`/api/auth/users/${id}`, {
        method: 'DELETE'
      });
      
      const data = await res.json();
      if (res.ok) {
        setUploadMessage({ type: 'success', text: data.message });
        setConfirmDelete(null);
        fetchUsers();
      } else {
        setUploadMessage({ type: 'error', text: data.message });
      }
    } catch (err) {
      setUploadMessage({ type: 'error', text: 'Network error or session expired' });
    } finally {
      setUserActionLoading(false);
    }
  };

  const handleUpdateUserDetails = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setShowUpdateConfirm(true);
  };

  const confirmUpdateDetails = async () => {
    if (!editingUser) return;
    
    setUserActionLoading(true);
    try {
      const res = await apiRequest(`/api/auth/users/${editingUser._id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(editFormData)
      });
      
      const data = await res.json();
      if (res.ok) {
        setUploadMessage({ type: 'success', text: data.message });
        setEditingUser(null);
        setShowUpdateConfirm(false);
        fetchUsers();
      } else {
        setUploadMessage({ type: 'error', text: data.message });
      }
    } catch (err) {
      setUploadMessage({ type: 'error', text: 'Network error or session expired' });
    } finally {
      setUserActionLoading(false);
    }
  };
  const [reportsLoading, setReportsLoading] = useState(false);

  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);

  const fetchInProgress = React.useRef(false);

  const fetchNotifications = async () => {
    if (fetchInProgress.current) return;
    fetchInProgress.current = true;
    try {
      const res = await apiRequest('/api/notifications');
      if (res.ok) {
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const data = await res.json();
          setNotifications(data.notifications || []);
          setUnreadNotifications(data.unreadCount || 0);
        }
      } else if (res.status === 429) {
        console.warn('Rate limit hit for notifications. Throttling poll...');
      } else {
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const errData = await res.json();
          console.error('API Error fetching notifications:', errData.message);
        } else {
          // Suppress error log for 429 specifically if it somehow fell through
          if (res.status !== 429) {
            console.error(`Status ${res.status} error fetching notifications from ${res.url}`);
          }
        }
      }
    } catch (err: any) {
      if (err.message !== 'Session expired' && !err.isNetworkError) {
        console.error('Failed to fetch notifications:', err);
      }
    } finally {
      fetchInProgress.current = false;
    }
  };

  const markAsRead = async (id: string) => {
    try {
      const res = await apiRequest(`/api/notifications/${id}/read`, {
        method: 'PATCH'
      });
      if (res.ok) {
        setNotifications(prev => prev.map(n => n._id === id ? { ...n, isRead: true } : n));
        setUnreadNotifications(prev => Math.max(0, prev - 1));
      }
    } catch (err) {
      console.error('Failed to mark as read:', err);
    }
  };

  const markAllAsRead = async () => {
    try {
      const res = await apiRequest('/api/notifications/read-all', {
        method: 'PATCH'
      });
      if (res.ok) {
        setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
        setUnreadNotifications(0);
      }
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    }
  };

  const handleUpdateReportStatus = async (reportId: string, newStatus: string) => {
    setUserActionLoading(true);
    try {
      const res = await apiRequest(`/api/reports/${reportId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: newStatus })
      });
      
      const data = await res.json();
      if (res.ok) {
        setUploadMessage({ type: 'success', text: data.message });
        fetchReports(reportPage);
      } else {
        setUploadMessage({ type: 'error', text: data.message });
      }
    } catch (err: any) {
      if (err.message !== 'Session expired') {
        setUploadMessage({ type: 'error', text: 'Network error' });
      }
    } finally {
      setUserActionLoading(false);
    }
  };

  const fetchReportHistory = async (reportId: string) => {
    setHistoryLoading(true);
    setReportHistory([]);
    try {
      const res = await apiRequest(`/api/reports/${reportId}/history`);
      if (res.ok) {
        const data = await res.json();
        setReportHistory(data.logs);
      }
    } catch (err) {
      console.error('Failed to fetch history:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleViewHistory = (report: any) => {
    setHistoryTargetReport(report);
    fetchReportHistory(report._id);
  };

  const [settings, setSettings] = useState<any[]>([]);
  const [settingsLoading, setSettingsLoading] = useState(false);

  const fetchSettings = async () => {
    if (user?.role !== UserRole.ADMIN) return;
    setSettingsLoading(true);
    try {
      const res = await apiRequest('/api/settings');
      if (res.ok) setSettings(await res.json());
    } catch (err: any) {
      if (err.message !== 'Session expired') {
        console.error('Failed to fetch settings:', err);
      }
    } finally {
      setSettingsLoading(false);
    }
  };

  const handleSyncClusters = async () => {
    if (!confirm('This will recalculate clusters for all existing records. Continue?')) return;
    
    setIsSyncingClusters(true);
    try {
      const res = await apiRequest('/api/reports/maintenance/sync-clusters', {
        method: 'POST'
      });
      const data = await res.json();
      if (res.ok && data.message) {
        setUploadMessage({ type: 'success', text: data.message });
        await fetchReports(reportPage);
        await fetchAnalysisData();
      } else {
        setUploadMessage({ type: 'error', text: data.message || 'Sync failed' });
      }
    } catch (err: any) {
      setUploadMessage({ type: 'error', text: err.message || 'Sync failed' });
    } finally {
      setIsSyncingClusters(false);
    }
  };

  const handleUpdateSetting = async (key: string, value: any) => {
    try {
      const res = await apiRequest('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ key, value })
      });
      if (res.ok) {
        fetchSettings();
        setUploadMessage({ type: 'success', text: 'Setting updated successfully' });
      }
    } catch (err) {
      console.error('Failed to update setting:', err);
    }
  };

  const initSettings = async () => {
    try {
      const res = await apiRequest('/api/settings/init', {
        method: 'POST'
      });
      if (res.ok) fetchSettings();
    } catch (err) {
      console.error('Failed to init settings:', err);
    }
  };
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isUpdated, setIsUpdated] = useState(false);
  const [updateProgress, setUpdateProgress] = useState(0);
  const [complianceStatus, setComplianceStatus] = useState<'For Evaluation' | 'Approved for Payment' | 'Issued COC' | 'Approved' | 'Deferred'>('Deferred');
  const [complianceDate, setComplianceDate] = useState(new Date().toISOString().split('T')[0]);
  const [evaluationRemarks, setEvaluationRemarks] = useState('');
  const [cooperativeTypeEdit, setCooperativeTypeEdit] = useState('');
  const [specificType, setSpecificType] = useState('');
  const [dateInspected, setDateInspected] = useState('');
  const [inspectionStatus, setInspectionStatus] = useState('');
  const [dateIssuedRecommended, setDateIssuedRecommended] = useState('');
  const [dateCompliedToOTCandSCO, setDateCompliedToOTCandSCO] = useState('');
  const [documentFindings, setDocumentFindings] = useState<Record<string, { value: string, findings: string }>>({});
  const [isAiThinking, setIsAiThinking] = useState<string | null>(null);

  const handleAiSuggest = async (docId: string, docLabel: string) => {
    setIsAiThinking(docId);
    try {
      const res = await apiRequest('/api/gemini/suggest-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cooperativeName: selectedReport.cooperativeName,
          cooperativeType: selectedReport.cooperativeType,
          documentLabel: docLabel,
          currentStatus: documentFindings[docId]?.value
        })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to get AI suggestion');
      }

      const { suggestion } = await res.json();
      if (suggestion) {
        setDocumentFindings(prev => ({
          ...prev,
          [docId]: {
            ...prev[docId],
            findings: suggestion
          }
        }));
      }
    } catch (err) {
      console.error('AI Suggestion Error:', err);
      setUploadMessage({ type: 'error', text: 'Failed to generate AI suggestion.' });
    } finally {
      setIsAiThinking(null);
    }
  };
  
  useEffect(() => {
    if (selectedReport) {
      setComplianceStatus(selectedReport.complianceStatus || 'Deferred');
      setComplianceDate(selectedReport.complianceDate || new Date().toISOString().split('T')[0]);
      setEvaluationRemarks(selectedReport.evaluationRemarks || '');
      setCooperativeTypeEdit(selectedReport.cooperativeType || '');
      setSpecificType(selectedReport.specificType || '');
      setDateInspected(selectedReport.dateInspected ? new Date(selectedReport.dateInspected).toISOString().split('T')[0] : '');
      setInspectionStatus(selectedReport.inspectionStatus || '');
      setDateIssuedRecommended(selectedReport.dateIssuedRecommended ? new Date(selectedReport.dateIssuedRecommended).toISOString().split('T')[0] : '');
      setDateCompliedToOTCandSCO(selectedReport.dateCompliedToOTCandSCO ? new Date(selectedReport.dateCompliedToOTCandSCO).toISOString().split('T')[0] : '');

      // Initialize document findings from parsedData
      const docTypes = [
        { id: 'CAPR', short: 'CAPR', findingsKey: 'Summary of findings' },
        { id: 'AFS', short: 'AFS', findingsKey: 'Summary of findings_5' },
        { id: 'SAR', short: 'SAR', findingsKey: 'Summary of findings_2' },
        { id: 'PAR', short: 'PAR', findingsKey: 'Summary of findings_3' },
        { id: 'SWORN STATEMENT AFFIDAVIT', short: 'SWORN', findingsKey: 'Summary of findings_6' },
        { id: 'MEDCON', short: 'MEDCON', findingsKey: 'Summary of findings_4' },
      ];

      const initialFindings: Record<string, { value: string, findings: string }> = {};
      docTypes.forEach(doc => {
        const val = selectedReport.parsedData?.[doc.id] || selectedReport.parsedData?.[doc.short] || 'Not Complying';
        const find = selectedReport.parsedData?.[doc.findingsKey] || 
                     selectedReport.parsedData?.[`Summary of findings (${doc.id})`] ||
                     selectedReport.parsedData?.[`Summary of findings (${doc.short})`] ||
                     '';
        initialFindings[doc.id] = { value: val, findings: find };
      });
      setDocumentFindings(initialFindings);
    }
  }, [selectedReport]);

  const handleAiSuggestMain = async () => {
    setIsAiThinking('main');
    try {
      const summary = Object.entries(documentFindings)
        .map(([id, data]: [string, any]) => `${id}: ${data.value} - ${data.findings}`)
        .join('\n');

      const res = await apiRequest('/api/gemini/summarize-evaluation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cooperativeName: selectedReport.cooperativeName,
          findings: summary
        })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to get AI summary');
      }

      const { suggestion } = await res.json();
      if (suggestion) {
        setEvaluationRemarks(suggestion);
      }
    } catch (err) {
      console.error('AI Summary Error:', err);
      setUploadMessage({ type: 'error', text: 'Failed to generate AI summary.' });
    } finally {
      setIsAiThinking(null);
    }
  };

  const handleUpdate = async () => {
    if (!selectedReport) return;
    
    setIsUpdating(true);
    setIsUpdated(false);
    setUpdateProgress(0);
    
    // Simulate updating progress
    const interval = setInterval(() => {
      setUpdateProgress(prev => {
        if (prev >= 100) return 100;
        return prev + Math.floor(Math.random() * 8) + 2;
      });
    }, 100);

    try {
      const updatePayload: any = {
        complianceStatus,
        complianceDate,
        evaluationRemarks,
        cooperativeType: cooperativeTypeEdit,
        specificType,
        dateInspected,
        inspectionStatus,
        dateIssuedRecommended,
        dateCompliedToOTCandSCO,
        // Update main status if Issued COC
        status: selectedReport.status,
        // Include updated document findings in parsedData
        parsedData: {
          ...(selectedReport.parsedData || {})
        }
      };

      // Map document findings back to parsedData
      Object.entries(documentFindings).forEach(([id, entry]) => {
        const data = entry as { value: string, findings: string };
        const docType = [
          { id: 'CAPR', findingsKey: 'Summary of findings' },
          { id: 'AFS', findingsKey: 'Summary of findings_5' },
          { id: 'SAR', findingsKey: 'Summary of findings_2' },
          { id: 'PAR', findingsKey: 'Summary of findings_3' },
          { id: 'MEDCON', findingsKey: 'Summary of findings_4' },
          { id: 'SWORN STATEMENT AFFIDAVIT', findingsKey: 'Summary of findings_6' },
        ].find(d => d.id === id);

        if (docType) {
          updatePayload.parsedData[id] = data.value;
          updatePayload.parsedData[docType.findingsKey] = data.findings;
        }
      });

      // Auto-approve overall registry status if compliance status is Approved or Issued COC
      if (complianceStatus === 'Issued COC') {
        updatePayload.status = 'Issued COC';
      } else if (complianceStatus === 'Approved') {
        updatePayload.status = 'Approved';
      } else if (complianceStatus === 'Deferred' || complianceStatus === 'For Evaluation') {
        updatePayload.status = 'Pending';
      }

      // Logic for updating the report in the backend
      const res = await apiRequest(`/api/reports/${selectedReport._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatePayload)
      });

      const data = await res.json();

      if (res.ok) {
        setUpdateProgress(100);
        await new Promise(resolve => setTimeout(resolve, 500));
        setUploadMessage({ type: 'success', text: data.message || 'Registry record updated successfully' });
        setIsUpdated(true);
        
        // Update local selected report to reflect changes immediately
        if (data.report) {
          setSelectedReport(data.report);
        }
        
        // Refresh reports list if necessary or update local state
        fetchStats();
        fetchReports(reportPage);

        // Reset the "Updated" state after 3 seconds
        setTimeout(() => setIsUpdated(false), 3000);
      } else {
        throw new Error(data.message || 'Update failed');
      }
    } catch (err: any) {
      console.error('Update failed:', err);
      setUploadMessage({ type: 'error', text: `Update failed: ${err.message}` });
    } finally {
      clearInterval(interval);
      setTimeout(() => {
        setIsUpdating(false);
        setUpdateProgress(0);
      }, 300);
    }
  };

  const chartData = React.useMemo(() => {
    if (!stats?.regionDistribution || stats.regionDistribution.length === 0) {
      return [
        { name: 'NCR', count: 0 },
        { name: 'REG I', count: 0 },
        { name: 'REG II', count: 0 },
        { name: 'REG III', count: 0 },
        { name: 'REG IV', count: 0 },
        { name: 'REG V', count: 0 },
      ];
    }
    return stats.regionDistribution.map((rd: any) => ({
      name: rd._id || 'Unknown',
      count: rd.count
    })).sort((a: any, b: any) => b.count - a.count);
  }, [stats]);

  const provinceData = React.useMemo(() => {
    if (!stats?.provinceDistribution || stats.provinceDistribution.length === 0) {
      return [];
    }
    return stats.provinceDistribution.map((pd: any) => ({
      name: pd._id || 'Others',
      count: pd.count
    })).sort((a: any, b: any) => b.count - a.count);
  }, [stats]);

  const displayChartData = React.useMemo(() => {
    // If we have a region filter active, or user is regional analyst, prefer province data
    if ((reportRegionFilter || user?.role === UserRole.REGIONAL_ANALYST) && provinceData.length > 0) {
      return provinceData;
    }
    return chartData;
  }, [chartData, provinceData, reportRegionFilter, user?.role]);

  const cooperativeTypeData = React.useMemo(() => {
    if (!stats?.cooperativeTypeDistribution || stats.cooperativeTypeDistribution.length === 0) {
      return [
        { name: 'Multipurpose', count: 0 },
        { name: 'Credit', count: 0 },
        { name: 'Consumer', count: 0 },
        { name: 'Service', count: 0 },
      ];
    }
    return stats.cooperativeTypeDistribution.map((td: any) => ({
      name: td._id || 'Others',
      count: td.count
    })).sort((a: any, b: any) => b.count - a.count);
  }, [stats]);

  const fetchStats = async () => {
    try {
      const params = new URLSearchParams();
      if (reportRegionFilter) params.append('region', reportRegionFilter);
      if (reportProvinceFilter) params.append('province', reportProvinceFilter);
      if (reportCooperativeTypeFilter) params.append('cooperativeType', reportCooperativeTypeFilter);
      if (reportCooperativeClusterFilter) params.append('cooperativeCluster', reportCooperativeClusterFilter);
      
      const res = await apiRequest(`/api/dashboard/stats${params.toString() ? `?${params.toString()}` : ''}`);
      if (res.ok) {
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          setStats(await res.json());
        } else {
          console.warn('Dashboard stats returned non-JSON response');
        }
      }
    } catch (err: any) {
      if (err.message !== 'Session expired') {
        console.error('Failed to fetch stats:', err);
      }
    }
  };

  const fetchUsers = async () => {
    if (user?.role !== UserRole.ADMIN) return;
    setUsersLoading(true);
    try {
      const res = await apiRequest('/api/auth/users');
      if (res.ok) {
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          setUsers(await res.json());
        }
      }
    } catch (err: any) {
      if (err.message !== 'Session expired') {
        console.error('Failed to fetch users:', err);
      }
    } finally {
      setUsersLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserActionLoading(true);
    try {
      const res = await apiRequest('/api/auth/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(newUser)
      });
      
      const data = await res.json();
      if (res.ok) {
        setUploadMessage({ type: 'success', text: data.message });
        if (data.tempPassword) {
          setCreatedUserTempPass({ email: newUser.email, pass: data.tempPassword });
        }
        setIsAddingUser(false);
        setNewUser({ email: '', displayName: '', role: UserRole.ANALYST, region: user?.region || '' });
        fetchUsers();
      } else {
        setUploadMessage({ type: 'error', text: data.message });
      }
    } catch (err) {
      setUploadMessage({ type: 'error', text: 'Network error or session expired' });
    } finally {
      setUserActionLoading(false);
    }
  };

  const fetchReports = async (page = 1) => {
    setReportsLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
        status: reportStatusFilter,
        complianceStatus: reportComplianceFilter,
        cooperativeType: reportCooperativeTypeFilter,
        cooperativeCluster: reportCooperativeClusterFilter,
        region: reportRegionFilter,
        province: reportProvinceFilter,
        sortBy: reportSortBy,
        sortOrder: reportSortOrder,
        search: reportSearch
      });

      const url = `/api/reports?${params.toString()}`;
      console.log('Fetching reports from:', url);
      const res = await apiRequest(url);
      if (res.ok) {
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const data = await res.json();
          setReports(data.reports);
          setReportTotal(data.total);
          setReportPages(data.pages);
          setReportPage(data.currentPage);
        } else {
          const text = await res.text();
          console.error('Expected JSON but received:', text.substring(0, 100));
          throw new Error('Server returned HTML instead of JSON. This likely means the API route was not found and it fell through to the SPA entry point.');
        }
      } else {
        let errorMessage = 'Failed to fetch reports';
        try {
          const data = await res.json();
          errorMessage = data.message || errorMessage;
        } catch (jsonErr) {
          // If not JSON, it's likely HTML error page
          const text = await res.text();
          if (text.includes('<!DOCTYPE html>')) {
            errorMessage = 'Server error (HTML received). Check logs.';
          } else {
            errorMessage = text.substring(0, 100);
          }
        }
        throw new Error(errorMessage);
      }
    } catch (err: any) {
      if (err.message !== 'Session expired') {
        console.error('Failed to fetch reports:', err);
      }
    } finally {
      setReportsLoading(false);
    }
  };

  const fetchAnalysisData = async () => {
    setIsAnalysisLoading(true);
    try {
      const params = new URLSearchParams({
        status: reportStatusFilter,
        complianceStatus: reportComplianceFilter,
        cooperativeType: reportCooperativeTypeFilter,
        cooperativeCluster: reportCooperativeClusterFilter,
        region: reportRegionFilter,
        province: reportProvinceFilter,
        search: reportSearch
      });

      const url = `/api/reports/stats?${params.toString()}`;
      const res = await apiRequest(url);
      if (res.ok) {
        const data = await res.json();
        setAnalysisData(data);
      }
    } catch (err) {
      console.error('Failed to fetch analysis data:', err);
    } finally {
      setIsAnalysisLoading(false);
    }
  };

  const handleExportCSV = async () => {
    try {
      const params = new URLSearchParams({
        status: reportStatusFilter,
        complianceStatus: reportComplianceFilter,
        cooperativeType: reportCooperativeTypeFilter,
        cooperativeCluster: reportCooperativeClusterFilter,
        region: reportRegionFilter,
        province: reportProvinceFilter,
        sortBy: reportSortBy,
        sortOrder: reportSortOrder,
        search: reportSearch
      });

      const url = `/api/reports/export?${params.toString()}`;
      
      const res = await apiRequest(url);
      if (res.ok) {
        const blob = await res.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.setAttribute('download', `reports-export-${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(downloadUrl);
        
        setUploadMessage({ type: 'success', text: 'CSV export started successfully' });
      } else {
         const data = await res.json().catch(() => ({ message: 'Export failed' }));
         setUploadMessage({ type: 'error', text: data.message || 'Failed to export CSV' });
      }
    } catch (err: any) {
      if (err.message !== 'Session expired') {
        console.error('Export failed:', err);
        setUploadMessage({ type: 'error', text: 'Failed to export CSV' });
      }
    }
  };

  const fetchAuditLogs = async (page = 1) => {
    if (user?.role !== UserRole.ADMIN) return;
    setAuditLoading(true);
    try {
      const res = await apiRequest(`/api/audit?page=${page}&limit=50`);
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data.logs);
        setAuditTotal(data.total);
        setAuditPages(data.pages);
        setAuditPage(data.currentPage);
      }
    } catch (err: any) {
      if (err.message !== 'Session expired') {
        console.error('Failed to fetch audit logs:', err);
      }
    } finally {
      setAuditLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [token, reportRegionFilter, reportProvinceFilter, reportCooperativeTypeFilter, reportCooperativeClusterFilter]);

  useEffect(() => {
    fetchNotifications();
    
    // Refresh notifications every 60 seconds
    const interval = setInterval(fetchNotifications, 60000);
    return () => clearInterval(interval);
  }, [token]);

  useEffect(() => {
    if (activeTab === 'users') fetchUsers();
    if (activeTab === 'reports' || activeTab === 'builder') {
      fetchReports(reportPage);
      if (activeTab === 'builder') {
        fetchAnalysisData();
      }
    }
    if (activeTab === 'audit') fetchAuditLogs(auditPage);
    if (activeTab === 'settings') fetchSettings();
  }, [token, activeTab, reportPage, auditPage, reportStatusFilter, reportComplianceFilter, reportCooperativeTypeFilter, reportCooperativeClusterFilter, reportRegionFilter, reportProvinceFilter, reportSortBy, reportSortOrder, reportSearch]);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassLoading(true);
    try {
      const res = await apiRequest('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ newPassword })
      });
      if (res.ok) {
        setShowPasswordChange(false);
        // Update local user data so modal doesn't reappear on refresh
        const savedUser = localStorage.getItem('cda_user');
        if (savedUser) {
          const userData = JSON.parse(savedUser);
          userData.mustChangePassword = false;
          localStorage.setItem('cda_user', JSON.stringify(userData));
        }
      } else {
        const data = await res.json();
        alert(data.message || 'Failed to update password');
      }
    } catch (err) {
      alert('Network error or session expired');
    } finally {
      setPassLoading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvFile(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n');
      if (lines.length > 0) {
        const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        setCsvHeaders(headers);
        const newMapping = { ...columnMapping };
        const autoDetected = new Set<string>();

        const mappingLogic: Record<string, string[]> = {
          cooperativeName: ['cooperative name', 'name'],
          registrationNumber: ['registration number', 'reg no'],
          reportType: ['cooperative type', 'type'],
          submissionDate: ['date', 'submission', 'submitted'],
          region: ['region'],
          province: ['province'],
          municipality: ['municipality', 'city'],
          street: ['street', 'address'],
          category: ['category'],
          assetSize2025: ['asset size 2025'],
          assetSize2026: ['asset size 2026'],
          statusOfCompliance: ['status of compliance'],
          statusDetails: ['status details'],
          status: ['status']
        };

        headers.forEach(h => {
          const lower = h.toLowerCase();
          Object.entries(mappingLogic).forEach(([field, keywords]) => {
            if (keywords.some(k => lower.includes(k)) && !newMapping[field]) {
              newMapping[field] = h;
              autoDetected.add(field);
            }
          });
        });

        setColumnMapping(newMapping);
        setAutoMappedFields(autoDetected);
        setIngestStep('map');
      }
    };
    reader.readAsText(file);
  };

  const handleFinalIngest = async () => {
    if (!csvFile) return;
    setUploadLoading(true);
    setUploadMessage(null);
    setUploadProgress(0);
    setUploadTimeLeft(null);

    const reader = new FileReader();
    reader.onload = async (event) => {
      const csvData = event.target?.result as string;
      const body = JSON.stringify({ 
        csvData,
        mapping: columnMapping
      });

      const token = localStorage.getItem('cda_token');
      const xhr = new XMLHttpRequest();
      const startTime = Date.now();

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percentComplete = Math.round((e.loaded / e.total) * 100);
          setUploadProgress(percentComplete);

          // Estimate time remaining
          const timeElapsed = (Date.now() - startTime) / 1000; // seconds
          if (timeElapsed > 0.5 && percentComplete > 0) {
            const uploadSpeed = e.loaded / timeElapsed; // bytes per second
            const remainingBytes = e.total - e.loaded;
            const remainingTime = Math.round(remainingBytes / uploadSpeed);
            setUploadTimeLeft(remainingTime);
          }
        }
      });

      xhr.addEventListener('load', () => {
        setUploadLoading(false);
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            setUploadMessage({ type: 'success', text: data.message });
            setIngestStep('upload');
            setCsvFile(null);
            fetchStats();
          } catch (e) {
            setUploadMessage({ type: 'error', text: 'Error parsing server response' });
          }
        } else if (xhr.status === 401) {
          localStorage.removeItem('cda_token');
          localStorage.removeItem('cda_user');
          window.location.href = '/?expired=true';
        } else {
          try {
            const data = JSON.parse(xhr.responseText);
            setUploadMessage({ type: 'error', text: data.message || 'Server error' });
          } catch (e) {
            setUploadMessage({ type: 'error', text: `Error ${xhr.status}: ${xhr.statusText}` });
          }
        }
      });

      xhr.addEventListener('error', () => {
        setUploadLoading(false);
        setUploadMessage({ type: 'error', text: 'Network error occurred' });
      });

      xhr.open('POST', '/api/reports/ingest');
      xhr.setRequestHeader('Content-Type', 'application/json');
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }
      xhr.send(body);
    };
    reader.readAsText(csvFile);
  };

  const renderIngest = () => (
    <div className="space-y-6">
      <header>
        <h2 className="text-2xl font-bold text-[var(--text-main)] tracking-tight">Data Ingestion Engine</h2>
        <p className="text-sm text-[var(--text-muted)]">Bulk upload cooperative records with intelligent column mapping</p>
      </header>

      {ingestStep === 'upload' ? (
        <div className="bg-[var(--card)] border-2 border-dashed border-[var(--border)] rounded-2xl p-12 text-center hover:border-blue-500 transition-colors group relative">
          <input type="file" accept=".csv" onChange={handleFileSelect} className="absolute inset-0 opacity-0 cursor-pointer z-10" />
          <div className="flex flex-col items-center">
            <div className="w-16 h-16 bg-blue-50 dark:bg-blue-900/20 rounded-full flex items-center justify-center text-blue-600 dark:text-blue-400 mb-4 group-hover:scale-110 transition-transform">
              <FileUp size={32} />
            </div>
            <h3 className="text-lg font-bold text-[var(--text-main)] mb-1">Select Registry File</h3>
            <p className="text-sm text-[var(--text-muted)] mb-6 font-medium">Supported Format: CSV (UTF-8)</p>
            <div className="bg-blue-600 text-white px-6 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-blue-600/20">
              Browse Local Records
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-sm overflow-hidden transition-colors">
          <div className="px-6 py-4 border-b border-[var(--border)] bg-[var(--bg)] flex justify-between items-center transition-colors">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-[var(--text-main)] text-sm">Target Schema Mapping</h3>
              <div className="relative group/main-tooltip">
                <Shield size={14} className="text-blue-500 cursor-help" />
                <div className="absolute left-0 top-full mt-2 w-72 bg-slate-900 text-white text-[10px] p-3 rounded-xl opacity-0 group-hover/main-tooltip:opacity-100 transition-opacity pointer-events-none z-[60] shadow-2xl border border-slate-700 leading-relaxed">
                  <p className="font-bold border-b border-white/10 pb-1 mb-2 uppercase tracking-widest">Intelligent Mapping Logic</p>
                  Our engine automatically scans CSV headers for keywords (e.g., "Registration", "Name", "Coop") to match them with our internal schema. 
                  <ul className="mt-2 space-y-1 text-slate-400">
                    <li>• <span className="text-blue-400 font-bold italic">Auto</span>: Header matched common keywords</li>
                    <li>• <span className="text-orange-400 font-bold italic">Manual</span>: You manually selected or overrode a column</li>
                  </ul>
                </div>
              </div>
            </div>
            <button onClick={() => setIngestStep('upload')} className="text-[11px] font-bold text-[var(--text-muted)] hover:text-[var(--text-main)] uppercase tracking-widest transition-colors">Cancel</button>
          </div>
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
              {[
                { key: 'cooperativeName', label: 'Cooperative Name', req: true, tooltip: "The legal name of the cooperative." },
                { key: 'registrationNumber', label: 'Registration Number', req: true, tooltip: "CDA-issued registration ID." },
                { key: 'statusDetails', label: 'Status Details', req: false, tooltip: "Descriptive status of the cooperative." },
                { key: 'status', label: 'Status', req: false, tooltip: "Primary operational status." },
                { key: 'region', label: 'Region', req: false, tooltip: "PSGC Region identifier or name." },
                { key: 'province', label: 'Province', req: false, tooltip: "PSGC Province identifier or name." },
                { key: 'municipality', label: 'Municipality', req: false, tooltip: "City or Municipal identifier." },
                { key: 'street', label: 'Street Address', req: false, tooltip: "Physical location details." },
                { key: 'category', label: 'Category', req: false, tooltip: "Cooperative size classification (Micro, Small, etc.)" },
                { key: 'reportType', label: 'Cooperative Type', req: false, tooltip: "Type of cooperative (Producers, Transport, etc.)" },
                { key: 'assetSize2025', label: 'Asset Size 2025', req: false, tooltip: "Reported assets for current year." },
                { key: 'assetSize2026', label: 'Asset Size 2026', req: false, tooltip: "Projected assets for next year." },
                { key: 'statusOfCompliance', label: 'Status of Compliance', req: false, tooltip: "Compliance evaluation result." },
              ].map(field => (
                <div key={field.key} className="relative group">
                  <div className="flex items-center gap-2 mb-2">
                    <label className="block text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-widest">
                      {field.label} {field.req && <span className="text-red-500">*</span>}
                    </label>
                    {autoMappedFields.has(field.key) && (
                      <div className="flex items-center gap-1 bg-blue-50 dark:bg-blue-900/40 px-1.5 py-0.5 rounded border border-blue-100 dark:border-blue-800 transition-colors">
                        <CheckCircle2 size={10} className="text-blue-600 dark:text-blue-400" />
                        <span className="text-[8px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-tighter">Auto</span>
                      </div>
                    )}
                    <div className="relative group/tooltip">
                      <ShieldAlert size={12} className="text-[var(--text-muted)] cursor-help hover:text-blue-500 transition-colors" />
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-slate-900 text-white text-[10px] p-2 rounded-lg opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none z-50 shadow-xl border border-slate-700">
                        {field.tooltip}
                      </div>
                    </div>
                  </div>
                  <div className="relative">
                    <select 
                      value={columnMapping[field.key]}
                      onChange={(e) => {
                        const newMapping = { ...columnMapping, [field.key]: e.target.value };
                        setColumnMapping(newMapping);
                        const newAuto = new Set(autoMappedFields);
                        newAuto.delete(field.key); // Mark as user-selected once changed
                        setAutoMappedFields(newAuto);
                      }}
                      className={`w-full bg-[var(--bg)] border rounded-xl px-4 py-3 text-sm text-[var(--text-main)] focus:border-blue-500 outline-none appearance-none transition-all ${
                        autoMappedFields.has(field.key) 
                          ? 'border-blue-500/30' 
                          : 'border-[var(--border)]'
                      }`}
                    >
                      <option value="">-- Ignore Field --</option>
                      {csvHeaders.map((h, i) => (<option key={`${h}-${i}`} value={h}>{h}</option>))}
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--text-muted)]">
                      <Search size={14} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/50 p-4 rounded-xl flex gap-4 transition-colors">
              <Terminal className="text-blue-600 dark:text-blue-400 shrink-0" size={20} />
              <p className="text-[12px] text-blue-700 dark:text-blue-300 leading-relaxed font-medium">
                Detected <span className="font-black">{csvHeaders.length}</span> columns in source file. 
                Internal parser will use the mapping above to normalize data.
              </p>
            </div>
            <button 
              onClick={handleFinalIngest}
              disabled={uploadLoading || !columnMapping.cooperativeName || !columnMapping.registrationNumber}
              className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold text-sm shadow-xl shadow-blue-600/20 hover:bg-blue-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {uploadLoading ? (
                <div className="flex items-center gap-2">
                  <FuturisticLoader size={20} text="" />
                  <span>NEGOTIATING SYNC...</span>
                </div>
              ) : 'Execute Ingestion Plan'}
            </button>

            {uploadLoading && (
              <div className="space-y-2 mt-4">
                <div className="flex justify-between text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-widest">
                  <span>Uploading Data...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="w-full bg-[var(--bg)] rounded-full h-2 overflow-hidden border border-[var(--border)]">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${uploadProgress}%` }}
                    className="bg-blue-600 h-full transition-all duration-300 ease-out"
                  />
                </div>
                {uploadTimeLeft !== null && (
                  <p className="text-[10px] text-[var(--text-muted)] text-right font-medium">
                    Estimated time remaining: {uploadTimeLeft > 60 ? `${Math.floor(uploadTimeLeft / 60)}m ${uploadTimeLeft % 60}s` : `${uploadTimeLeft}s`}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {uploadMessage && (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`p-4 rounded-xl border flex items-center gap-3 mt-4 ${
            uploadMessage.type === 'success' ? 'bg-green-50 text-green-700 border-green-100' : 'bg-red-50 text-red-700 border-red-100'
          }`}
        >
          {uploadMessage.type === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          <span className="text-sm font-bold">{uploadMessage.text}</span>
        </motion.div>
      )}
    </div>
  );

  const renderAudit = () => (
    <div className="space-y-6">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-[var(--text-main)] tracking-tight">Personnel Audit Trail</h2>
          <p className="text-sm text-[var(--text-muted)]">Immutable record of administrative and evaluation operations</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            disabled={auditPage === 1 || auditLoading}
            onClick={() => setAuditPage(prev => Math.max(1, prev - 1))}
            className="px-4 py-2 bg-[var(--card)] border border-[var(--border)] rounded-xl text-sm font-bold text-[var(--text-muted)] disabled:opacity-50 hover:bg-[var(--bg)] transition-all flex items-center gap-2 transition-colors"
          >
             Previous
          </button>
          <div className="px-4 py-2 bg-[var(--bg)] rounded-xl text-xs font-black text-[var(--text-muted)] uppercase tracking-widest leading-6 transition-colors">
            Page {auditPage} of {auditPages}
          </div>
          <button
            disabled={auditPage === auditPages || auditLoading}
            onClick={() => setAuditPage(prev => Math.min(auditPages, prev + 1))}
            className="px-4 py-2 bg-[var(--card)] border border-[var(--border)] rounded-xl text-sm font-bold text-[var(--text-muted)] disabled:opacity-50 hover:bg-[var(--bg)] transition-all flex items-center gap-2 transition-colors"
          >
            Next
          </button>
        </div>
      </header>

      <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-sm overflow-x-auto transition-colors">
        <table className="w-full text-left text-[12px] min-w-[800px]">
          <thead>
            <tr className="bg-[var(--bg)] border-b border-[var(--border)] text-[var(--text-muted)] font-bold uppercase tracking-widest transition-colors">
              <th className="px-6 py-4">Action</th>
              <th className="px-6 py-4">Operator</th>
              <th className="px-6 py-4">Details</th>
              <th className="px-6 py-4">Target</th>
              <th className="px-6 py-4">Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {auditLoading ? (
              <tr>
                <td colSpan={5} className="p-32 text-center">
                  <FuturisticLoader size={120} text="TRACE LOGS" />
                </td>
              </tr>
            ) : auditLogs.length === 0 ? (
              <tr><td colSpan={5} className="p-20 text-center text-[var(--text-muted)] font-medium italic">No audit records found</td></tr>
            ) : auditLogs.map((log, i) => (
              <tr key={log._id || `log-${i}`} className="border-b border-[var(--border)] hover:bg-[var(--bg)] transition-colors group text-[var(--text-muted)]">
                <td className="px-6 py-4">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                    log.action.includes('USER') ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400' : 
                    log.action.includes('REPORT') ? 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400' : 'bg-[var(--bg)] text-[var(--text-muted)]'
                  }`}>
                    {log.action.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="px-6 py-4 text-[var(--text-main)]">
                  <div className="font-bold">{log.user?.displayName || 'Unknown User'}</div>
                  <div className="text-[10px] text-[var(--text-muted)] font-mono">{log.user?.email || 'N/A'}</div>
                </td>
                <td className="px-6 py-4 text-[11px] max-w-xs">{log.details}</td>
                <td className="px-6 py-4">
                  <span className="px-1.5 py-0.5 rounded bg-[var(--bg)] text-[9px] font-black uppercase text-[var(--text-muted)] transition-colors">
                    {log.targetType}
                  </span>
                  {log.targetId && <div className="text-[9px] text-[var(--text-muted)] font-mono mt-1">ID: {log.targetId.substring(0, 8)}...</div>}
                </td>
                <td className="px-6 py-4 font-mono text-[10px] text-[var(--text-muted)]">
                  {new Date(log.timestamp).toLocaleString('en-PH', { 
                    year: 'numeric', month: 'short', day: 'numeric', 
                    hour: '2-digit', minute: '2-digit', second: '2-digit'
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderSettings = () => (
    <div className="space-y-8">
       <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-[var(--text-main)] tracking-tight">System Configuration</h2>
          <p className="text-sm text-[var(--text-muted)]">Global application behavior and domain-wide integration parameters</p>
        </div>
        <button 
          onClick={initSettings}
          className="px-4 py-2 bg-[var(--card)] border border-[var(--border)] rounded-xl text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest hover:text-blue-600 dark:hover:text-blue-400 hover:border-blue-200 dark:hover:border-blue-800 transition-all flex items-center gap-2 shadow-sm"
        >
          <Lock size={12} />
          Reset to Factory Defaults
        </button>
      </header>

      {settingsLoading ? (
        <div className="p-24 flex flex-col items-center justify-center space-y-6">
          <FuturisticLoader size={150} text="SYNCING SETTINGS" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {['GENERAL', 'INTEGRATIONS', 'NOTIFICATIONS', 'SECURITY'].map(category => {
            const categorySettings = settings.filter(s => s.category === category);
            if (categorySettings.length === 0) return null;

            return (
              <div key={category} className="bg-[var(--card)] border border-[var(--border)] rounded-3xl shadow-sm overflow-hidden flex flex-col transition-colors">
                <div className="px-8 py-5 border-b border-[var(--border)] bg-[var(--bg)] flex items-center justify-between transition-colors">
                  <h3 className="font-black text-[var(--text-main)] text-[10px] uppercase tracking-[0.2em]">{category}</h3>
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(37,99,235,0.5)]"></div>
                </div>
                <div className="p-8 space-y-8 flex-1">
                  {categorySettings.map(setting => (
                    <div key={setting.key} className="group">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <div className="font-bold text-[13px] text-[var(--text-main)] uppercase tracking-tight">{setting.key.replace(/_/g, ' ')}</div>
                          <p className="text-[11px] text-[var(--text-muted)] font-medium leading-relaxed mt-1 max-w-[240px]">{setting.description}</p>
                        </div>
                      </div>
                      
                      {typeof setting.value === 'boolean' ? (
                        <button 
                          onClick={() => handleUpdateSetting(setting.key, !setting.value)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all duration-300 focus:outline-none ${setting.value ? 'bg-blue-600' : 'bg-slate-700 dark:bg-slate-800'}`}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-300 ${setting.value ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                      ) : (
                        <div className="relative">
                          <input 
                            type="text"
                            defaultValue={setting.value}
                            onBlur={(e) => {
                              if (e.target.value !== String(setting.value)) {
                                handleUpdateSetting(setting.key, e.target.value);
                              }
                            }}
                            className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl px-4 py-2.5 text-xs font-bold text-[var(--text-main)] focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 outline-none transition-all"
                          />
                        </div>
                      )}
                      
                      <div className="h-px bg-[var(--border)] mt-8 group-last:hidden transition-colors" />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="bg-[#0F172A] rounded-3xl p-8 flex items-center gap-6 overflow-hidden relative">
         <div className="absolute right-0 top-0 p-4 opacity-5 pointer-events-none">
            <Shield size={160} className="text-white" />
         </div>
         <div className="w-12 h-12 bg-blue-600/20 rounded-2xl flex items-center justify-center text-blue-400 shrink-0">
            <Terminal size={24} />
         </div>
         <div>
            <h4 className="text-white font-bold text-sm mb-1 uppercase tracking-wider">Environmental Integrity</h4>
            <p className="text-slate-400 text-xs leading-relaxed max-w-xl">
               Changes to system parameters are committed to the immutable audit trail. Some integration variables may require a node restart to take effect in the production environment.
            </p>
         </div>
      </div>

      {user?.role === UserRole.ADMIN && (
        <div className="mt-8 space-y-8">
           <div className="bg-[var(--card)] border border-[var(--border)] rounded-3xl shadow-sm overflow-hidden flex flex-col transition-colors">
              <div className="px-8 py-5 border-b border-[var(--border)] bg-[var(--bg)] flex items-center justify-between transition-colors">
                <h3 className="font-black text-[var(--text-main)] text-[10px] uppercase tracking-[0.2em]">External Integrations</h3>
                <div className={`w-1.5 h-1.5 rounded-full shadow-lg ${emailStatus?.isReady ? 'bg-green-500 shadow-green-500/50' : 'bg-red-500 shadow-red-500/50'}`}></div>
              </div>
              <div className="p-8">
                <div className="flex flex-col md:flex-row items-center justify-between gap-6 p-6 bg-[var(--bg)] rounded-3xl border border-[var(--border)] group hover:border-blue-500/50 transition-all">
                  <div className="flex items-center gap-6">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors ${emailStatus?.isReady ? 'bg-green-100 dark:bg-green-900/30 text-green-600' : 'bg-red-100 dark:bg-red-900/30 text-red-600'}`}>
                      {emailStatus?.isReady ? <Check size={24} /> : <AlertTriangle size={24} />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-[var(--text-main)] uppercase tracking-tight">SMTP Email Notification Service</h4>
                        <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${emailStatus?.isReady ? 'bg-green-100 dark:bg-green-900/30 text-green-600' : 'bg-red-100 dark:bg-red-900/30 text-red-600'}`}>
                          {emailStatus?.isReady ? 'Active' : 'Offline'}
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--text-muted)] mt-1 font-medium max-w-sm">
                        Necessary for delivering temporary credentials to regional personnel. 
                        {emailStatus?.isReady 
                          ? ` Connected to ${emailStatus.config.host} as ${emailStatus.config.user}.` 
                          : ' Current credentials rejected by server.'
                        }
                      </p>
                      {emailStatus?.helpMessage && (
                        <p className="text-[10px] text-red-500 font-bold mt-2 bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded inline-block">
                          Note: {emailStatus.helpMessage}
                        </p>
                      )}
                      
                      {emailStatus?.lastError && !emailStatus?.helpMessage && (
                        <p className="text-[10px] text-red-500 font-bold mt-2 font-mono bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded inline-block">
                          Error: {emailStatus.lastError}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={handleVerifyEmail}
                      disabled={isVerifyingEmail}
                      className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-blue-600/20 transition-all flex items-center justify-center gap-2"
                    >
                      {isVerifyingEmail ? (
                        <>
                          <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                          Re-testing Link...
                        </>
                      ) : (
                        <>
                          <RefreshCw size={12} />
                          Test Connection
                        </>
                      )}
                    </button>
                  </div>
                </div>
                
                <div className="mt-8 border-t border-[var(--border)] pt-8">
                  <h4 className="text-xs font-black text-[var(--text-main)] uppercase tracking-[0.15em] mb-4 flex items-center gap-2">
                    <Settings size={14} className="text-blue-500" />
                    SMTP Parameters Editor
                  </h4>
                  
                  <form onSubmit={handleSaveSmtpSettings} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      
                      {/* Host */}
                      <div>
                        <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1.5">
                          SMTP Host
                        </label>
                        <input
                          type="text"
                          value={smtpHost}
                          onChange={e => setSmtpHost(e.target.value)}
                          placeholder="e.g. mail.smtp2go.com"
                          className="w-full px-4 py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs font-medium text-[var(--text-main)] focus:outline-none focus:border-blue-500 hover:border-[var(--text-muted)]/30 transition-colors"
                        />
                      </div>

                      {/* Port */}
                      <div>
                        <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1.5">
                          SMTP Port
                        </label>
                        <input
                          type="text"
                          value={smtpPort}
                          onChange={e => setSmtpPort(e.target.value)}
                          placeholder="e.g. 587 or 465"
                          className="w-full px-4 py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs font-medium text-[var(--text-main)] focus:outline-none focus:border-blue-500 hover:border-[var(--text-muted)]/30 transition-colors"
                        />
                      </div>

                      {/* Secure */}
                      <div>
                        <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1.5">
                          SSL / TLS (Secure)
                        </label>
                        <select
                          value={smtpSecure}
                          onChange={e => setSmtpSecure(e.target.value)}
                          className="w-full px-4 py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs font-medium text-[var(--text-main)] focus:outline-none focus:border-blue-500 hover:border-[var(--text-muted)]/30 transition-colors"
                        >
                          <option value="false">No (Use STARTTLS / Port 587)</option>
                          <option value="true">Yes (Use SSL on Port 465)</option>
                        </select>
                      </div>

                      {/* User */}
                      <div>
                        <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1.5">
                          SMTP Username / User
                        </label>
                        <input
                          type="text"
                          value={smtpUser}
                          onChange={e => setSmtpUser(e.target.value)}
                          placeholder="your-smtp-username"
                          className="w-full px-4 py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs font-medium text-[var(--text-main)] focus:outline-none focus:border-blue-500 hover:border-[var(--text-muted)]/30 transition-colors"
                        />
                      </div>

                      {/* Password */}
                      <div>
                        <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1.5">
                          SMTP Password
                        </label>
                        <input
                          type="password"
                          value={smtpPass}
                          onChange={e => setSmtpPass(e.target.value)}
                          placeholder="••••••••"
                          className="w-full px-4 py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs font-medium text-[var(--text-main)] focus:outline-none focus:border-blue-500 hover:border-[var(--text-muted)]/30 transition-colors"
                        />
                      </div>

                      {/* Sender From */}
                      <div>
                        <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1.5">
                          Sender Email (From)
                        </label>
                        <input
                          type="email"
                          value={smtpFrom}
                          onChange={e => setSmtpFrom(e.target.value)}
                          placeholder="e.g. sender@example.com"
                          className="w-full px-4 py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-xs font-medium text-[var(--text-main)] focus:outline-none focus:border-blue-500 hover:border-[var(--text-muted)]/30 transition-colors"
                        />
                      </div>

                    </div>

                    <div className="flex justify-end pt-2">
                      <button
                        type="submit"
                        disabled={isSavingSmtp}
                        className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-blue-600/20 transition-all flex items-center gap-2"
                      >
                        {isSavingSmtp ? (
                          <>
                            <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                            Saving settings...
                          </>
                        ) : (
                          <>
                            <Save size={12} />
                            Save Config & Verify
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
           </div>

           <div className="bg-[var(--card)] border border-[var(--border)] rounded-3xl shadow-sm overflow-hidden flex flex-col transition-colors">
              <div className="px-8 py-5 border-b border-[var(--border)] bg-[var(--bg)] flex items-center justify-between transition-colors">
                <h3 className="font-black text-[var(--text-main)] text-[10px] uppercase tracking-[0.2em]">Maintenance Tools</h3>
                <div className="w-1.5 h-1.5 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.5)]"></div>
              </div>
              <div className="p-8 space-y-6">
                <div className="flex flex-col md:flex-row items-center justify-between gap-6 p-6 bg-[var(--bg)] rounded-2xl border border-[var(--border)] group hover:border-orange-500/50 transition-all">
                  <div className="max-w-md">
                    <div className="font-bold text-sm text-[var(--text-main)] flex items-center gap-2">
                      <Layers size={16} className="text-orange-500" />
                      Synchronize Cooperative Clusters
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)] mt-1 font-medium italic">
                      Automatically recalculates and updates the cluster category for all existing reports based on their cooperative type. Use this after updating cluster definitions.
                    </p>
                  </div>
                  <button 
                    onClick={handleSyncClusters}
                    disabled={isSyncingClusters}
                    className="w-full md:w-auto px-6 py-2.5 bg-orange-600 hover:bg-orange-700 disabled:bg-slate-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-orange-600/20 transition-all flex items-center justify-center gap-2"
                  >
                    {isSyncingClusters ? (
                      <>
                        <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                        Processing...
                      </>
                    ) : (
                      <>
                        <RefreshCw size={12} />
                        Launch Synchronization
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
        </div>
      )}
    </div>
  );

  const SidebarItem = ({ icon: Icon, label, id, active }: { icon: any, label: string, id: string, active: boolean }) => (
    <button
      onClick={() => setActiveTab(id as any)}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
        active 
          ? 'bg-slate-800 text-white shadow-lg' 
          : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
      }`}
    >
      <Icon size={18} className={active ? 'text-accent' : ''} />
      <span className="truncate">{label}</span>
      {active && <motion.div layoutId="activeTab" className="ml-auto w-1 h-4 bg-accent rounded-full" />}
    </button>
  );

  const renderBuilder = () => {
    const availableFields = [
      { id: 'cooperativeName', label: 'Cooperative Name' },
      { id: 'registrationNumber', label: 'Registration Number' },
      { id: 'region', label: 'Region' },
      { id: 'status', label: 'Registry Status' },
      { id: 'complianceStatus', label: 'Compliance Status' },
      { id: 'inspectionStatus', label: 'Inspection Status' },
      { id: 'submissionDate', label: 'Submission Date' },
      { id: 'dateInspected', label: 'Date Inspected' },
      { id: 'dateIssuedRecommended', label: 'Date Issued/Rec' },
      { id: 'dateCompliedToOTCandSCO', label: 'Date Complied OTC/SCO' },
      { id: 'delay', label: 'Days Delayed' },
      { id: 'penalty', label: 'Penalty Amount' },
    ];

    const toggleField = (id: string) => {
      setSelectedBuilderFields(prev => 
        prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
      );
    };

    const complianceStats = analysisData?.complianceStats || [];
    const regionStats = analysisData?.regionStats || [];
    const clusterStats = analysisData?.clusterStats || [];

    const COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

    return (
      <div className="space-y-8 w-full">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <h2 className="text-3xl font-display font-bold text-[var(--text-main)] tracking-tight">Report Builder</h2>
            <p className="text-sm text-[var(--text-muted)]">Select fields and dimensions to generate a custom appraisal report</p>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-3xl shadow-sm overflow-hidden p-8 transition-colors relative">
              {isAnalysisLoading && (
                <div className="absolute inset-0 bg-[var(--card)]/50 backdrop-blur-[2px] z-10 flex items-center justify-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Recalculating...</p>
                  </div>
                </div>
              )}
              <h3 className="text-[11px] font-black text-[var(--text-muted)] uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                <BarChart3 size={14} className="text-emerald-500" />
                Live Analysis & Trends
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {complianceStats.length > 0 || regionStats.length > 0 ? (
                  <>
                    <div className="h-64 flex flex-col">
                       <p className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-4 text-center">Compliance Status Breakdown</p>
                       <div className="flex-1 min-h-0">
                         <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={complianceStats}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={80}
                              paddingAngle={5}
                              dataKey="value"
                            >
                              {complianceStats.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip 
                              contentStyle={{ 
                                backgroundColor: '#1E293B', 
                                border: 'none', 
                                borderRadius: '12px',
                                color: '#fff',
                                fontSize: '10px'
                              }} 
                            />
                            <Legend 
                              verticalAlign="bottom" 
                              height={36} 
                              iconType="circle"
                              formatter={(value) => <span className="text-[10px] text-[var(--text-muted)] font-bold">{value}</span>}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="h-64 flex flex-col">
                       <p className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-4 text-center">Top Regions by Submission</p>
                       <div className="flex-1 min-h-0">
                         <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={regionStats}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                            <XAxis 
                              dataKey="name" 
                              axisLine={false} 
                              tickLine={false} 
                              tick={{ fontSize: 9, fontWeight: 'bold' }}
                            />
                            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9 }} />
                            <Tooltip 
                              cursor={{ fill: 'transparent' }}
                              contentStyle={{ 
                                backgroundColor: '#1E293B', 
                                border: 'none', 
                                borderRadius: '12px',
                                color: '#fff',
                                fontSize: '10px'
                              }}
                            />
                            <Bar 
                              dataKey="value" 
                              fill="#3B82F6" 
                              radius={[6, 6, 0, 0]} 
                              barSize={30}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="h-64 flex flex-col md:col-span-2">
                       <p className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-4 text-center">Cluster Distribution</p>
                       <div className="flex-1 min-h-0">
                         <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={clusterStats} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" />
                            <XAxis type="number" hide />
                            <YAxis 
                              dataKey="name" 
                              type="category" 
                              axisLine={false} 
                              tickLine={false} 
                              width={150}
                              tick={{ fontSize: 8, fontWeight: 'black', fill: '#64748b' }}
                            />
                            <Tooltip 
                              cursor={{ fill: 'rgba(59, 130, 246, 0.05)' }}
                              contentStyle={{ 
                                backgroundColor: '#1E293B', 
                                border: 'none', 
                                borderRadius: '12px',
                                color: '#fff',
                                fontSize: '10px'
                              }}
                            />
                            <Bar 
                              dataKey="value" 
                              fill="#6366f1" 
                              radius={[0, 6, 6, 0]} 
                              barSize={20}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="col-span-1 md:col-span-2 h-64 flex flex-col items-center justify-center border border-dashed border-[var(--border)] rounded-2xl bg-[var(--bg)]">
                    <BarChart3 size={32} className="text-[var(--text-muted)] mb-4 opacity-20" />
                    <p className="text-sm font-bold text-[var(--text-muted)]">No analysis data found</p>
                    <p className="text-[10px] uppercase font-black tracking-widest text-[var(--text-muted)] opacity-50 mt-1">Adjust dimensions selection or try different filters</p>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-[var(--card)] border border-[var(--border)] rounded-3xl shadow-sm overflow-hidden p-8 transition-colors">
              <h3 className="text-[11px] font-black text-[var(--text-muted)] uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                <Layout size={14} className="text-blue-500" />
                Data Dimensions Selection
              </h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {availableFields.map((field) => (
                  <button
                    key={field.id}
                    onClick={() => toggleField(field.id)}
                    className={`flex items-center gap-4 p-4 rounded-2xl border transition-all ${
                      selectedBuilderFields.includes(field.id)
                        ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-600/20'
                        : 'bg-[var(--bg)] border-[var(--border)] text-[var(--text-muted)] hover:border-blue-400'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-md flex items-center justify-center border ${
                      selectedBuilderFields.includes(field.id) ? 'bg-white text-blue-600 border-white' : 'border-[var(--border)]'
                    }`}>
                      {selectedBuilderFields.includes(field.id) && <Check size={14} strokeWidth={4} />}
                    </div>
                    <span className="text-sm font-bold tracking-tight">{field.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-[var(--card)] border border-[var(--border)] rounded-3xl shadow-sm overflow-hidden p-8 transition-colors">
              <h3 className="text-[11px] font-black text-[var(--text-muted)] uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                <Filter size={14} className="text-purple-500" />
                Active Dataset Filters
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest pl-1">Region</label>
                  <select 
                    value={reportRegionFilter}
                    onChange={(e) => setReportRegionFilter(e.target.value)}
                    className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl px-4 py-3 text-xs font-bold text-[var(--text-main)] outline-none transition-all appearance-none"
                  >
                    <option value="">All Regions</option>
                    {PHILIPPINE_REGIONS.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest pl-1">Compliance Status</label>
                  <select 
                    value={reportComplianceFilter}
                    onChange={(e) => setReportComplianceFilter(e.target.value)}
                    className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl px-4 py-3 text-xs font-bold text-[var(--text-main)] outline-none transition-all appearance-none"
                  >
                    <option value="">All Statuses</option>
                    <option value="For Evaluation">For Evaluation</option>
                    <option value="Approved for Payment">Approved for Payment</option>
                    <option value="Issued COC">Issued COC</option>
                    <option value="Approved">Approved</option>
                    <option value="Deferred">Deferred</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest pl-1">Registry Status</label>
                  <select 
                   value={reportStatusFilter}
                   onChange={(e) => setReportStatusFilter(e.target.value)}
                   className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl px-4 py-3 text-xs font-bold text-[var(--text-main)] outline-none transition-all appearance-none"
                  >
                    <option value="">All Registry</option>
                    <option value="Complied">Complied</option>
                    <option value="Not Complied">Not Complied</option>
                  </select>
                </div>
              </div>
            </div>

          </div>

          <div className="space-y-6">
            <div className="bg-[#0F172A] rounded-3xl p-8 text-white relative overflow-hidden shadow-2xl">
              <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
                <FileText size={120} />
              </div>
              
              <h3 className="text-xl font-bold mb-2">Report Summary</h3>
              <p className="text-slate-400 text-xs mb-8">Generated document will contain {reports.length} records with {selectedBuilderFields.length} data points per entry.</p>
              
              <div className="space-y-4 mb-10">
                <div className="flex justify-between items-center bg-slate-800/50 p-4 rounded-2xl border border-slate-700/50">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Selected Fields</span>
                  <span className="text-sm font-black text-blue-400">{selectedBuilderFields.length}</span>
                </div>
                <div className="flex justify-between items-center bg-slate-800/50 p-4 rounded-2xl border border-slate-700/50">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Target Records</span>
                  <span className="text-sm font-black text-blue-400">{reports.length}</span>
                </div>
              </div>

              <button 
                onClick={() => {
                  const fieldsToGenerate = availableFields.filter(f => selectedBuilderFields.includes(f.id));
                  generateCustomReport(reports, fieldsToGenerate, {
                    region: reportRegionFilter,
                    status: reportStatusFilter
                  }, user);
                }}
                disabled={selectedBuilderFields.length === 0 || reports.length === 0}
                className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl shadow-blue-600/20 transition-all flex items-center justify-center gap-2 group"
              >
                <Download size={18} className="group-hover:translate-y-0.5 transition-transform" />
                Forge Document (PDF)
              </button>
            </div>

            <div className="bg-[var(--card)] border border-[var(--border)] rounded-3xl p-8 transition-colors">
              <h4 className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-4">Builder Intelligence</h4>
              <ul className="space-y-4">
                {[
                  { text: 'Dynamic Column Mapping', icon: CheckCircle2 },
                  { text: 'Landscape Orientation Auto-scaling', icon: CheckCircle2 },
                  { text: 'Regional Data Partitioning', icon: CheckCircle2 },
                  { text: 'Compliance Filter Integration', icon: CheckCircle2 },
                ].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-xs font-bold text-[var(--text-main)] transition-colors">
                    <item.icon size={14} className="text-green-500" />
                    {item.text}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderDashboard = () => (
    <div className="space-y-8">
      <header className="mb-10">
        <h1 className="text-3xl font-display font-bold text-[var(--text-main)] tracking-tight mb-2">Dashboard Overview</h1>
        <p className="text-sm text-[var(--text-muted)]">Real-time data synchronization for Cooperative Development Authority</p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {[
            { 
              value: stats?.totalReports || '154', 
              sub: 'TOTAL REPORTS PARSED', 
              icon: Users, 
              color: 'bg-blue-600' 
            },
            { 
              value: stats?.complianceRating ? `${stats.complianceRating}%` : '94.2%', 
              sub: 'COMPLIANCE RATING', 
              icon: CheckCircle2, 
              color: 'bg-green-500' 
            },
            { 
              value: stats?.totalAssetsValue ? `P${(stats.totalAssetsValue / 1e9).toFixed(1)}B` : 'P12.4B', 
              sub: 'ESTIMATED ASSET VALUE', 
              icon: BarChart3, 
              color: 'bg-purple-600' 
            },
            { 
              value: stats?.statusDistribution ? `${((stats.statusDistribution.find(s => s._id === 'Complied')?.count || 0) / (stats.totalReports || 1) * 100).toFixed(0)}%` : '100%', 
              sub: 'REPORTS UPDATED', 
              icon: ShieldCheck, 
              color: 'bg-orange-500' 
            },
          ].map((stat, i) => (
           <motion.div 
             key={stat.sub}
             initial={{ opacity: 0, y: 20 }}
             animate={{ opacity: 1, y: 0 }}
             transition={{ delay: i * 0.1 }}
             className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6 shadow-sm hover:shadow-md transition-all flex items-center justify-between"
           >
              <div>
                 <div className="text-3xl font-black text-[var(--text-main)] mb-1">{stat.value}</div>
                 <div className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest text-justify">{stat.sub}</div>
              </div>
              <div className={`w-10 h-10 ${stat.color} rounded-lg flex items-center justify-center text-white`}>
                 <stat.icon size={20} />
              </div>
           </motion.div>
         ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        <section className="md:col-span-2 lg:col-span-2 bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6 md:p-8 shadow-sm flex flex-col min-h-[450px] transition-colors">
          <div className="flex justify-between items-center mb-10">
            <h3 className="font-bold text-[var(--text-main)] uppercase tracking-widest text-[11px]">
              {(reportRegionFilter || user?.role === UserRole.REGIONAL_ANALYST) ? 'Reports per Province' : 'Reports by Region'}
            </h3>
            <div className="flex items-center gap-2">
               <div className="w-2 h-2 rounded-full bg-success"></div>
               <span className="text-[10px] font-bold text-success uppercase tracking-widest whitespace-nowrap">Active Session</span>
            </div>
          </div>
          <div className="flex-1 w-full flex flex-col">
             <div className="h-[250px]">
               <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                  <BarChart data={displayChartData} margin={{ top: 20, right: 30, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94A3B8', fontSize: 10, fontWeight: 700 }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94A3B8', fontSize: 10, fontWeight: 700 }} />
                    <Tooltip cursor={{ fill: '#F8FAFC' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                    <Bar dataKey="count" fill="#2563EB" radius={[4, 4, 0, 0]} barSize={32} />
                  </BarChart>
               </ResponsiveContainer>
             </div>

             <div className="mt-8 border-t border-slate-100 pt-8">
                <div className="flex justify-between items-center mb-6">
                  <h4 className="font-bold text-slate-900 text-[11px] uppercase tracking-widest">Recent Submissions</h4>
                  <button onClick={() => setActiveTab('reports')} className="text-blue-600 text-[10px] font-bold uppercase tracking-widest hover:underline">View All Records</button>
                </div>
                <div className="space-y-4">
                  {stats?.latestReports && stats.latestReports.length > 0 ? (
                    stats.latestReports.slice(0, 3).map((report: any) => (
                      <div 
                        key={report._id} 
                        onClick={() => setSelectedReport(report)}
                        className="flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 transition-all rounded-xl cursor-pointer group"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-white border border-slate-200 rounded-lg flex items-center justify-center text-slate-400 group-hover:text-blue-600 transition-colors">
                            <FileText size={18} />
                          </div>
                          <div>
                            <div className="text-sm font-bold text-slate-900 line-clamp-1">{report.cooperativeName}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{report.registrationNumber} • {report.region}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                            report.status === 'Approved' ? 'bg-green-100 text-green-700' : 
                            report.status === 'Issued COC' ? 'bg-blue-100 text-blue-700' :
                            'bg-orange-100 text-orange-700'
                          }`}>
                            {report.status}
                          </span>
                          <Eye size={14} className="text-slate-300 group-hover:text-slate-600" />
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center p-8 border border-dashed border-slate-200 rounded-xl">
                      <p className="text-xs text-slate-400 font-medium italic">No recent reports found in registry</p>
                    </div>
                  )}
                </div>
             </div>
          </div>
        </section>

        <section className="md:col-span-2 lg:col-span-1 bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6 md:p-8 shadow-sm flex flex-col transition-colors">
          <div className="flex justify-between items-center mb-10">
            <h3 className="font-bold text-[var(--text-main)] uppercase tracking-widest text-[11px]">Cooperatives by Type</h3>
            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
          </div>
          <div className="flex-1 w-full min-h-[300px]">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <BarChart layout="vertical" data={cooperativeTypeData} margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F1F5F9" />
                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#94A3B8', fontSize: 9, fontWeight: 700 }} />
                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: '#94A3B8', fontSize: 9, fontWeight: 700 }} width={80} />
                <Tooltip cursor={{ fill: '#F8FAFC' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                <Bar dataKey="count" fill="#4F46E5" radius={[0, 4, 4, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-6 space-y-3">
            {cooperativeTypeData.slice(0, 4).map((type, idx) => (
              <div key={type.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${['bg-blue-500', 'bg-indigo-500', 'bg-violet-500', 'bg-purple-500'][idx % 4]}`}></div>
                  <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">{type.name}</span>
                </div>
                <span className="text-[10px] font-black text-[var(--text-main)]">{type.count}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );

  const handleAddCoop = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserActionLoading(true);
    setUploadMessage(null);
    try {
      const res = await apiRequest('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCoop)
      });
      const data = await res.json();
      if (res.ok) {
        setUploadMessage({ type: 'success', text: data.message });
        setIsAddingCoop(false);
        setShowSecondaryType(false);
        setNewCoop({
          cooperativeName: '',
          registrationNumber: '',
          cooperativeType: '',
          secondaryCooperativeType: '',
          specificType: '',
          cooperativeCluster: '',
          secondaryCooperativeCluster: '',
          region: user?.region || '',
          province: '',
          municipality: '',
          street: '',
          category: '',
          assetSize2025: '',
          assetSize2026: '',
          status: 'Complied'
        });
        fetchReports(reportPage);
        fetchStats();
      } else {
        setUploadMessage({ type: 'error', text: data.message });
      }
    } catch (err: any) {
      setUploadMessage({ type: 'error', text: err.message || 'Failed to create record' });
    } finally {
      setUserActionLoading(false);
    }
  };

  const renderAddCoopModal = () => (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-[var(--card)] border border-[var(--border)] rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden overflow-y-auto max-h-[90vh]"
      >
        <div className="px-8 py-6 border-b border-[var(--border)] bg-[var(--bg)] flex items-center justify-between">
          <div>
            <h3 className="text-xl font-bold text-[var(--text-main)]">Register New Cooperative</h3>
            <p className="text-xs text-[var(--text-muted)] font-medium mt-1">Manual entry for individual cooperative records</p>
          </div>
          <button onClick={() => { setIsAddingCoop(false); setShowSecondaryType(false); }} className="p-2 hover:bg-[var(--bg)] rounded-xl transition-colors">
            <X size={20} className="text-[var(--text-muted)]" />
          </button>
        </div>
        
        <form onSubmit={handleAddCoop} className="p-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest ml-1">Cooperative Name *</label>
              <input 
                type="text" 
                required
                value={newCoop.cooperativeName}
                onChange={e => setNewCoop({...newCoop, cooperativeName: e.target.value})}
                placeholder="Enter full legal name"
                className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm font-bold text-[var(--text-main)] focus:border-blue-500 outline-none transition-all placeholder:font-medium placeholder:opacity-50"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest ml-1">Registration Number *</label>
              <input 
                type="text" 
                required
                value={newCoop.registrationNumber}
                onChange={e => setNewCoop({...newCoop, registrationNumber: e.target.value})}
                placeholder="CDA-REG-XXXXX"
                className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm font-bold text-[var(--text-main)] focus:border-blue-500 outline-none transition-all placeholder:font-medium placeholder:opacity-50"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between ml-1">
                <label className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest">Cooperative Type</label>
                {!showSecondaryType && (
                  <button 
                    type="button"
                    onClick={() => setShowSecondaryType(true)}
                    className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest hover:underline flex items-center gap-1"
                  >
                    <Plus size={10} /> Add Type
                  </button>
                )}
              </div>
              <select 
                value={newCoop.cooperativeType}
                onChange={e => {
                  const val = e.target.value;
                  const clusterObj = COOPERATIVE_CLUSTERS.find(c => c.types.includes(val));
                  setNewCoop({
                    ...newCoop, 
                    cooperativeType: val,
                    cooperativeCluster: clusterObj ? clusterObj.name : ''
                  });
                }}
                className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm font-bold text-[var(--text-main)] focus:border-blue-500 outline-none transition-all"
              >
                <option value="">Select Type</option>
                {ALL_COOP_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            
            {showSecondaryType && (
              <div className="space-y-2">
                <div className="flex items-center justify-between ml-1">
                  <label className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest">Secondary Cooperative Type</label>
                  <button 
                    type="button"
                    onClick={() => {
                      setShowSecondaryType(false);
                      setNewCoop({...newCoop, secondaryCooperativeType: '', secondaryCooperativeCluster: ''});
                    }}
                    className="text-[10px] font-black text-red-600 dark:text-red-400 uppercase tracking-widest hover:underline"
                  >
                    Remove
                  </button>
                </div>
                <select 
                  value={newCoop.secondaryCooperativeType}
                  onChange={e => {
                    const val = e.target.value;
                    const clusterObj = COOPERATIVE_CLUSTERS.find(c => c.types.includes(val));
                    setNewCoop({
                      ...newCoop, 
                      secondaryCooperativeType: val,
                      secondaryCooperativeCluster: clusterObj ? clusterObj.name : ''
                    });
                  }}
                  className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm font-bold text-[var(--text-main)] focus:border-blue-500 outline-none transition-all border-dashed border-slate-300 dark:border-slate-700"
                >
                  <option value="">Select Secondary Type</option>
                  {ALL_COOP_TYPES.filter(t => t !== newCoop.cooperativeType).map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            )}
            
            {(newCoop.cooperativeType || newCoop.secondaryCooperativeType) && (
              <div className="space-y-2 md:col-span-2">
                <label className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest ml-1">Assigned Cluster(s)</label>
                <div className="flex flex-col gap-2">
                  {newCoop.cooperativeType && (
                    <div className="flex items-center justify-between bg-blue-50 dark:bg-blue-900/20 px-4 py-3 rounded-xl border border-blue-100 dark:border-blue-800/50">
                      <div>
                        <p className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-tighter">Primary Category Cluster</p>
                        <p className="text-sm font-black text-blue-900 dark:text-blue-100">{newCoop.cooperativeCluster || 'Not Classified'}</p>
                      </div>
                      <Layers size={18} className="text-blue-500 opacity-50" />
                    </div>
                  )}
                  {newCoop.secondaryCooperativeType && (
                    <div className="flex items-center justify-between bg-purple-50 dark:bg-purple-900/20 px-4 py-3 rounded-xl border border-purple-100 dark:border-purple-800/50">
                      <div>
                        <p className="text-[10px] font-bold text-purple-600 dark:text-purple-400 uppercase tracking-tighter">Secondary Category Cluster</p>
                        <p className="text-sm font-black text-purple-900 dark:text-purple-100">{newCoop.secondaryCooperativeCluster || 'Not Classified'}</p>
                      </div>
                      <Layers size={18} className="text-purple-500 opacity-50" />
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest ml-1">Specific Type / Purpose</label>
              <input 
                type="text" 
                value={newCoop.specificType}
                onChange={e => setNewCoop({...newCoop, specificType: e.target.value})}
                placeholder="e.g. Rice Producers, etc."
                className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm font-bold text-[var(--text-main)] focus:border-blue-500 outline-none transition-all placeholder:font-medium placeholder:opacity-50"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest ml-1">Registry Status</label>
              <select 
                value={newCoop.status}
                onChange={e => setNewCoop({...newCoop, status: e.target.value})}
                className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm font-bold text-[var(--text-main)] focus:border-blue-500 outline-none transition-all"
              >
                <option value="Complied">Complied</option>
                <option value="Not Complied">Not Complied</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest ml-1">Region</label>
              <select 
                value={newCoop.region}
                onChange={e => setNewCoop({...newCoop, region: e.target.value, province: ''})}
                className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm font-bold text-[var(--text-main)] focus:border-blue-500 outline-none transition-all"
              >
                <option value="">Select Region</option>
                {PHILIPPINE_REGIONS.map(r => <option key={r.id} value={r.id}>{r.name} ({r.id})</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest ml-1">Province</label>
              <select 
                value={newCoop.province}
                onChange={e => setNewCoop({...newCoop, province: e.target.value})}
                className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm font-bold text-[var(--text-main)] focus:border-blue-500 outline-none transition-all"
              >
                <option value="">Select Province</option>
                {PHILIPPINE_PROVINCES.filter(p => p.regionId === newCoop.region).map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
              </select>
            </div>
            <div className="space-y-2">
               <label className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest ml-1">Category</label>
               <select 
                value={newCoop.category}
                onChange={e => setNewCoop({...newCoop, category: e.target.value})}
                className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm font-bold text-[var(--text-main)] focus:border-blue-500 outline-none transition-all"
              >
                <option value="">Select Category</option>
                <option value="Micro">Micro</option>
                <option value="Small">Small</option>
                <option value="Medium">Medium</option>
                <option value="Large">Large</option>
              </select>
            </div>
            <div className="space-y-2 text-right flex flex-col justify-end">
               <p className="text-[10px] text-[var(--text-muted)] italic mb-2">Registration will be attributed to current operator.</p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest ml-1">Full Office Address</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input 
                type="text" 
                value={newCoop.municipality}
                onChange={e => setNewCoop({...newCoop, municipality: e.target.value})}
                placeholder="City/Municipality"
                className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm font-bold text-[var(--text-main)] focus:border-blue-500 outline-none transition-all"
              />
              <input 
                type="text" 
                value={newCoop.street}
                onChange={e => setNewCoop({...newCoop, street: e.target.value})}
                placeholder="Street/Barangay"
                className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm font-bold text-[var(--text-main)] focus:border-blue-500 outline-none transition-all"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-[var(--border)]">
             <div className="space-y-2">
              <label className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest ml-1">Asset Size 2025</label>
              <input 
                type="text" 
                value={newCoop.assetSize2025}
                onChange={e => setNewCoop({...newCoop, assetSize2025: e.target.value})}
                placeholder="Enter amount"
                className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm font-bold text-[var(--text-main)] focus:border-blue-500 outline-none transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest ml-1">Asset Size 2026</label>
              <input 
                type="text" 
                value={newCoop.assetSize2026}
                onChange={e => setNewCoop({...newCoop, assetSize2026: e.target.value})}
                placeholder="Enter amount"
                className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm font-bold text-[var(--text-main)] focus:border-blue-500 outline-none transition-all"
              />
            </div>
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800/50 p-4 rounded-2xl flex gap-4 transition-colors">
            <Shield size={20} className="text-blue-600 dark:text-blue-400 shrink-0" />
            <p className="text-[11px] text-blue-700 dark:text-blue-300 font-medium leading-relaxed">
              New records are automatically assigned a <span className="font-bold underline">Pending</span> evaluation status. Compliance status can be updated via the repository after creation.
            </p>
          </div>

          <div className="flex gap-4 pt-2">
            <button 
              type="button"
              onClick={() => { setIsAddingCoop(false); setShowSecondaryType(false); }}
              className="flex-1 px-6 py-4 bg-[var(--bg)] border border-[var(--border)] rounded-2xl text-sm font-black text-[var(--text-muted)] uppercase tracking-widest hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
            >
              Discard Changes
            </button>
            <button 
              type="submit"
              disabled={userActionLoading || !newCoop.cooperativeName || !newCoop.registrationNumber}
              className="flex-1 px-6 py-4 bg-blue-600 text-white rounded-2xl text-sm font-black uppercase tracking-widest shadow-xl shadow-blue-600/20 hover:bg-blue-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {userActionLoading ? <FuturisticLoader size={20} text="" /> : 'Create Cooperative Record'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );

  const renderReports = () => (
    <div className="space-y-6">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-[var(--text-main)] tracking-tight">Report Repository</h2>
          <p className="text-sm text-[var(--text-muted)]">Managing {reportTotal} records in active registry</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setIsAddingCoop(true)}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-bold shadow-lg shadow-green-600/10 hover:shadow-green-600/20 active:scale-95 transition-all flex items-center gap-2"
          >
            <UserPlus size={16} />
            Add New
          </button>
          <button
            onClick={handleExportCSV}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-600/10 hover:shadow-blue-600/20 active:scale-95 transition-all flex items-center gap-2"
          >
            <Download size={16} />
            Export CSV
          </button>
          <button
            onClick={() => generateSummaryReport(reports, {
              status: reportStatusFilter,
              complianceStatus: reportComplianceFilter,
              region: reportRegionFilter
            }, user)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-600/10 hover:shadow-indigo-600/20 active:scale-95 transition-all flex items-center gap-2 mr-2"
          >
            <FileText size={16} />
            Download PDF
          </button>
          
          <div className="flex items-center gap-1.5 bg-[var(--bg)] border border-[var(--border)] p-1 rounded-xl shadow-sm hover:border-blue-500/10 transition-all">
            <button
              disabled={reportPage === 1 || reportsLoading}
              onClick={() => setReportPage(prev => Math.max(1, prev - 1))}
              className="p-1.5 bg-[var(--card)] border border-[var(--border)] rounded-lg text-xs font-bold text-[var(--text-muted)] hover:text-[var(--text-main)] disabled:opacity-40 hover:bg-[var(--bg)] transition-all flex items-center gap-1 shadow-sm disabled:pointer-events-none"
              title="Previous Page"
            >
               <ChevronLeft size={14} />
               <span className="hidden sm:inline">Prev</span>
            </button>
            <div className="px-3 text-[10px] font-black text-[var(--text-muted)] uppercase tracking-wider select-none">
              {reportPage} / {reportPages}
            </div>
            <button
              disabled={reportPage === reportPages || reportsLoading}
              onClick={() => setReportPage(prev => Math.min(reportPages, prev + 1))}
              className="p-1.5 bg-[var(--card)] border border-[var(--border)] rounded-lg text-xs font-bold text-[var(--text-muted)] hover:text-[var(--text-main)] disabled:opacity-40 hover:bg-[var(--bg)] transition-all flex items-center gap-1 shadow-sm disabled:pointer-events-none"
              title="Next Page"
            >
              <span className="hidden sm:inline">Next</span>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </header>

      {/* Filter and Sort Controls */}
      <div className="space-y-4 mb-6">
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-sm transition-colors">
          <label className="flex items-center gap-2 text-[9px] font-black text-[var(--text-muted)] uppercase tracking-[0.2em] mb-2 ml-1 opacity-70">
            <Search size={10} className="text-blue-500" />
            Search Registry
          </label>
          <div className="relative">
            <input 
              type="text"
              value={searchInputValue}
              onChange={(e) => setSearchInputValue(e.target.value)}
              placeholder="Filter by cooperative name or registration number..."
              className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl px-10 py-2.5 text-sm font-medium text-[var(--text-main)] outline-none focus:border-blue-500 transition-all dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-black"
            />
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
              <Search size={18} />
            </div>
            {searchInputValue && (
              <button 
                onClick={() => {
                  setSearchInputValue('');
                  setReportSearch('');
                  setReportPage(1);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-sm grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 transition-colors">
        <div>
          <label className="flex items-center gap-2 text-[9px] font-black text-[var(--text-muted)] uppercase tracking-[0.2em] mb-2 ml-1 opacity-70">
            <span className="w-1 h-1 bg-blue-500 rounded-full"></span>
            Compliance Status
          </label>
          <select 
            value={reportComplianceFilter}
            onChange={(e) => {
              setReportComplianceFilter(e.target.value);
              setReportPage(1);
            }}
            className="w-full bg-[var(--bg)] border border-blue-500/30 rounded-lg px-3 py-2 text-xs font-bold text-[var(--text-main)] outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all hover:border-blue-500/50 cursor-pointer shadow-sm shadow-blue-500/5 hover:bg-blue-500/5 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-black"
          >
            <option value="">All Compliance</option>
            <option value="Approved">Approved</option>
            <option value="Approved for Payment">Approved for Payment</option>
            <option value="Issued COC">Issued COC</option>
            <option value="Deferred">Deferred</option>
            <option value="For Evaluation">For Evaluation</option>
          </select>
        </div>

        <div>
          <label className="flex items-center gap-2 text-[9px] font-black text-[var(--text-muted)] uppercase tracking-[0.2em] mb-2 ml-1 opacity-70">
            <span className="w-1 h-1 bg-orange-500 rounded-full"></span>
            Registry Status
          </label>
          <select 
            value={reportStatusFilter}
            onChange={(e) => {
              setReportStatusFilter(e.target.value);
              setReportPage(1);
            }}
            className="w-full bg-[var(--bg)] border border-orange-500/30 rounded-lg px-3 py-2 text-xs font-bold text-[var(--text-main)] outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 transition-all hover:border-orange-500/50 cursor-pointer shadow-sm shadow-orange-500/5 hover:bg-orange-500/5 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-black"
          >
            <option value="">All Registry</option>
            <option value="Complied">Complied</option>
            <option value="Not Complied">Not Complied</option>
          </select>
        </div>

        {user?.role !== UserRole.REGIONAL_ANALYST && (
          <div>
            <label className="flex items-center gap-2 text-[9px] font-black text-[var(--text-muted)] uppercase tracking-[0.2em] mb-2 ml-1 opacity-70">
              <span className="w-1 h-1 bg-blue-500 rounded-full"></span>
              Region Filter
            </label>
            <select 
              value={reportRegionFilter}
              onChange={(e) => {
                setReportRegionFilter(e.target.value);
                setReportProvinceFilter(''); // Reset province when region changes
                setReportPage(1);
              }}
              className="w-full bg-[var(--bg)] border border-blue-500/30 rounded-lg px-3 py-2 text-xs font-bold text-[var(--text-main)] outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all hover:border-blue-500/50 cursor-pointer shadow-sm shadow-blue-500/5 hover:bg-blue-500/5 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-black"
            >
              <option value="">All Regions</option>
              {PHILIPPINE_REGIONS.map(reg => (
                <option key={reg.id} value={reg.id}>{reg.name}</option>
              ))}
            </select>
          </div>
        )}

          <div>
            <label className="flex items-center gap-2 text-[9px] font-black text-[var(--text-muted)] uppercase tracking-[0.2em] mb-2 ml-1 opacity-70">
              <span className="w-1 h-1 bg-blue-500 rounded-full"></span>
              Province Filter
            </label>
            <select 
              value={reportProvinceFilter}
              onChange={(e) => {
                setReportProvinceFilter(e.target.value);
                setReportPage(1);
              }}
              className="w-full bg-[var(--bg)] border border-blue-500/30 rounded-lg px-3 py-2 text-xs font-bold text-[var(--text-main)] outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all hover:border-blue-500/50 cursor-pointer shadow-sm shadow-blue-500/5 hover:bg-blue-500/5 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-black"
            >
              <option value="">All Provinces</option>
              {PHILIPPINE_PROVINCES.filter(p => {
                let activeRegion = user?.role === UserRole.REGIONAL_ANALYST ? user.region : reportRegionFilter;
                
                // If the activeRegion is a code or name, find the corresponding ID
                if (activeRegion) {
                  const match = PHILIPPINE_REGIONS.find(r => 
                    r.id === activeRegion || 
                    r.code === activeRegion || 
                    r.name.includes(activeRegion)
                  );
                  if (match) activeRegion = match.id;
                }
                
                return !activeRegion || p.regionId === activeRegion;
              }).map(prov => (
                <option key={prov.id} value={prov.id}>{prov.name}</option>
              ))}
            </select>
          </div>

        <div>
          <label className="flex items-center gap-2 text-[9px] font-black text-[var(--text-muted)] uppercase tracking-[0.2em] mb-2 ml-1 opacity-70">
            <span className="w-1 h-1 bg-blue-500 rounded-full"></span>
            Filter by Cooperative Types
          </label>
          <select 
            value={reportCooperativeTypeFilter}
            onChange={(e) => {
              setReportCooperativeTypeFilter(e.target.value);
              setReportPage(1);
            }}
            className="w-full bg-[var(--bg)] border border-blue-500/30 rounded-lg px-3 py-2 text-xs font-bold text-[var(--text-main)] outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all hover:border-blue-500/50 cursor-pointer shadow-sm shadow-blue-500/5 hover:bg-blue-500/5 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-black"
            id="coop_type_filter_select"
          >
            <option value="">All Types</option>
            {[...ALL_COOP_TYPES].sort().map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="flex items-center gap-2 text-[9px] font-black text-[var(--text-muted)] uppercase tracking-[0.2em] mb-2 ml-1 opacity-70">
            <span className="w-1 h-1 bg-blue-500 rounded-full"></span>
            Filter by Cluster
          </label>
          <select 
            value={reportCooperativeClusterFilter}
            onChange={(e) => {
              setReportCooperativeClusterFilter(e.target.value);
              setReportPage(1);
            }}
            className="w-full bg-[var(--bg)] border border-blue-500/30 rounded-lg px-3 py-2 text-xs font-bold text-[var(--text-main)] outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all hover:border-blue-500/50 cursor-pointer shadow-sm shadow-blue-500/5 hover:bg-blue-500/5 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-black"
            id="cluster_filter_select"
          >
            <option value="">All Clusters</option>
            {COOPERATIVE_CLUSTERS.map(cluster => (
              <option key={cluster.name} value={cluster.name}>{cluster.name}</option>
            ))}
          </select>
        </div>

        <div className="flex items-end">
          <button
            onClick={() => {
              setReportStatusFilter('');
              setReportComplianceFilter('');
              setReportRegionFilter('');
              setReportProvinceFilter('');
              setReportCooperativeTypeFilter('');
              setReportCooperativeClusterFilter('');
              setReportSearch('');
              setSearchInputValue('');
              setReportPage(1);
            }}
            className="w-full px-4 py-2 border border-red-500/20 bg-red-500/5 hover:bg-black hover:border-red-500 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-2 group text-red-500 dark:hover:bg-black"
          >
            <X size={14} className="group-hover:rotate-90 transition-transform" />
            Clear All Filters
          </button>
        </div>
      </div>
    </div>

    <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-sm overflow-hidden transition-colors">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[12px] min-w-[800px]">
          <thead>
            <tr className="bg-[var(--bg)] border-b border-[var(--border)] text-[var(--text-muted)] font-bold uppercase tracking-widest transition-colors">
              <th className="px-6 py-4">Reg No.</th>
              <th className="px-6 py-4">Cooperative Name</th>
              <th className="px-6 py-4">Region</th>
              <th className="px-6 py-4">Type</th>
              <th className="px-6 py-4">Cluster</th>
              <th className="px-6 py-4">Compliance</th>
              <th className="px-6 py-4">Date Updated</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {reportsLoading ? (
              <tr>
                <td colSpan={6} className="p-32 text-center">
                  <FuturisticLoader size={120} text="SYNCING DATA" />
                </td>
              </tr>
            ) : reports.map((r, i) => (
              <React.Fragment key={r._id || `report-${i}`}>
                <tr 
                  onClick={() => setExpandedReportId(expandedReportId === r._id ? null : r._id)}
                  className={`border-b border-[var(--border)] hover:bg-[var(--bg)] transition-colors group cursor-pointer transition-colors ${expandedReportId === r._id ? 'bg-[var(--bg)] shadow-inner' : ''}`}
                >
                  <td className="px-6 py-4 font-mono text-[var(--text-muted)]">{r.registrationNumber}</td>
                  <td className="px-6 py-4 font-bold text-[var(--text-main)] group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    <div>{r.cooperativeName}</div>
                    <div className="text-[9px] font-medium text-[var(--text-muted)] uppercase">{r.municipality || r.province || 'No Location'}</div>
                  </td>
                  <td className="px-6 py-4 font-bold text-[var(--text-muted)]">
                    {PHILIPPINE_REGIONS.find(reg => reg.id === r.region)?.id || r.region}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1">
                      <div className="text-[var(--text-main)] font-black text-[11px] uppercase tracking-tight">
                        {r.cooperativeType || r.reportType}
                      </div>
                      {r.secondaryCooperativeType && (
                        <div className="text-[10px] font-bold text-blue-500/70 uppercase tracking-tighter flex items-center gap-1">
                          <Plus size={8} /> {r.secondaryCooperativeType}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          (() => {
                            const cluster = COOPERATIVE_CLUSTERS.find(c => c.name === r.cooperativeCluster);
                            if (!cluster) return 'bg-slate-400';
                            switch (cluster.id) {
                              case 'financial': return 'bg-blue-500';
                              case 'consumers_marketing': return 'bg-emerald-500';
                              case 'human_services': return 'bg-rose-500';
                              case 'education_advocacy': return 'bg-amber-500';
                              case 'agriculture': return 'bg-green-600';
                              case 'utilities': return 'bg-cyan-500';
                              default: return 'bg-slate-400';
                            }
                          })()
                        }`}></span>
                        <div className="text-[var(--text-muted)] font-black text-[9px] uppercase truncate max-w-[150px]" title={r.cooperativeCluster || 'Uncategorized'}>
                          {r.cooperativeCluster || 'Uncategorized'}
                        </div>
                      </div>
                      {r.secondaryCooperativeCluster && (
                        <div className="flex items-center gap-1.5 opacity-60">
                          <span className={`w-1 h-1 rounded-full shrink-0 ${
                            (() => {
                              const cluster = COOPERATIVE_CLUSTERS.find(c => c.name === r.secondaryCooperativeCluster);
                              if (!cluster) return 'bg-slate-400';
                              switch (cluster.id) {
                                case 'financial': return 'bg-blue-500';
                                case 'consumers_marketing': return 'bg-emerald-500';
                                case 'human_services': return 'bg-rose-500';
                                case 'education_advocacy': return 'bg-amber-500';
                                case 'agriculture': return 'bg-green-600';
                                case 'utilities': return 'bg-cyan-500';
                                default: return 'bg-slate-400';
                              }
                            })()
                          }`}></span>
                          <div className="text-[var(--text-muted)] font-bold text-[8px] uppercase truncate max-w-[150px]" title={r.secondaryCooperativeCluster || 'Uncategorized'}>
                            {r.secondaryCooperativeCluster}
                          </div>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded text-[10px] font-black uppercase ${
                      (r.complianceStatus || r.statusOfCompliance) === 'Approved' ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' : 
                      (r.complianceStatus || r.statusOfCompliance) === 'Issued COC' ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400' :
                      (r.complianceStatus || r.statusOfCompliance) === 'Deferred' ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400' : 
                      'bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400'
                    }`}>
                      {r.complianceStatus || r.statusOfCompliance || 'Pending'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-[var(--text-muted)]">
                    {new Date(r.updatedAt || r.submissionDate || r.createdAt || Date.now()).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      <button 
                        onClick={() => setSelectedReport(r)}
                        className="p-2 text-[var(--text-muted)] hover:text-blue-600 dark:hover:text-blue-400 transition-colors hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg"
                        title="View Full Data"
                      >
                        <Eye size={18} />
                      </button>
                      <button 
                        onClick={() => handleViewHistory(r)}
                        className="p-2 text-[var(--text-muted)] hover:text-purple-600 dark:hover:text-purple-400 transition-colors hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg"
                        title="View History"
                      >
                        <History size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
                {expandedReportId === r._id && (
                  <tr>
                    <td colSpan={7} className="px-8 py-10 bg-[var(--bg)] border-b border-[var(--border)] overflow-hidden">
                      <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        className="space-y-8"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="text-xl font-bold text-[var(--text-main)] mb-1 uppercase tracking-tight">Parsed Ingestion Data</h4>
                            <p className="text-xs text-[var(--text-muted)] font-medium">Detailed view of all fields captured from the CSV ingestion process.</p>
                          </div>
                          <button 
                            onClick={() => setExpandedReportId(null)}
                            className="bg-[var(--card)] border border-[var(--border)] px-4 py-2 rounded-xl text-[10px] font-black text-[var(--text-muted)] uppercase tracking-[0.2em] hover:text-red-500 hover:border-red-500 transition-all flex items-center gap-2"
                          >
                            <X size={12} />
                            Close Preview
                          </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                          {Object.entries(r.parsedData || {}).map(([key, value]) => (
                            <div key={key} className="bg-[var(--card)] border border-[var(--border)] p-4 rounded-xl transition-colors hover:border-blue-500/20 group">
                              <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1 truncate transition-colors group-hover:text-blue-400" title={key}>
                                {key}
                              </label>
                              <div className="text-[12px] font-black text-[var(--text-main)] leading-relaxed break-words">
                                {String(value) || <span className="opacity-20 italic font-medium">No Data</span>}
                              </div>
                            </div>
                          ))}
                        </div>

                        {r.secondaryCooperativeType && (
                          <div className="bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800/50 rounded-2xl p-6 flex flex-col md:flex-row gap-6 items-start md:items-center">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-blue-100 dark:bg-blue-800 rounded-xl flex items-center justify-center text-blue-600 dark:text-blue-400">
                                <Layers size={20} />
                              </div>
                              <div>
                                <h5 className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest">Secondary Categorization</h5>
                                <p className="text-sm font-black text-[var(--text-main)]">{r.secondaryCooperativeType}</p>
                              </div>
                            </div>
                            <div className="hidden md:block w-px h-8 bg-blue-200 dark:bg-blue-800" />
                            <div>
                                <h5 className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest">Assigned Cluster</h5>
                                <p className="text-sm font-bold text-[var(--text-muted)]">{r.secondaryCooperativeCluster || 'Not Classified'}</p>
                            </div>
                          </div>
                        )}

                        <div className="flex justify-end pr-4">
                          <button 
                            onClick={() => setSelectedReport(r)}
                            className="text-blue-600 dark:text-blue-400 text-[10px] font-black uppercase tracking-[0.2em] hover:underline flex items-center gap-2"
                          >
                            <LayoutDashboard size={14} />
                            View Full Analysis & Evaluation
                          </button>
                        </div>
                      </motion.div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
      
      {/* Modern, high-polished Table Pagination Footer */}
      <div className="px-6 py-4 bg-[var(--bg)]/50 border-t border-[var(--border)] flex flex-col sm:flex-row items-center justify-between gap-4 transition-colors">
        <div className="text-xs text-[var(--text-muted)] font-bold uppercase tracking-wider select-none">
          Showing <span className="text-[var(--text-main)] font-black transition-colors">{(reportPage - 1) * 10 + 1}</span> to <span className="text-[var(--text-main)] font-black transition-colors">{Math.min(reportPage * 10, reportTotal)}</span> of <span className="text-[var(--text-main)] font-black transition-colors">{reportTotal}</span> Records
        </div>
        
        <div className="flex items-center gap-1.5 bg-[var(--bg)] border border-[var(--border)] p-1 rounded-xl shadow-sm hover:border-blue-500/10 transition-colors">
          <button
            disabled={reportPage === 1 || reportsLoading}
            onClick={() => {
              setReportPage(prev => Math.max(1, prev - 1));
              const el = document.getElementById('coop_type_filter_select');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
            }}
            className="p-1.5 bg-[var(--card)] border border-[var(--border)] rounded-lg text-xs font-bold text-[var(--text-muted)] hover:text-[var(--text-main)] disabled:opacity-40 hover:bg-[var(--bg)] transition-all flex items-center gap-1 shadow-sm disabled:pointer-events-none"
            title="Previous Page"
          >
             <ChevronLeft size={14} />
             <span>Prev</span>
          </button>
          <div className="px-3 text-[10px] font-black text-[var(--text-muted)] uppercase tracking-wider select-none">
            Page {reportPage} of {reportPages}
          </div>
          <button
            disabled={reportPage === reportPages || reportsLoading}
            onClick={() => {
              setReportPage(prev => Math.min(reportPages, prev + 1));
              const el = document.getElementById('coop_type_filter_select');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
            }}
            className="p-1.5 bg-[var(--card)] border border-[var(--border)] rounded-lg text-xs font-bold text-[var(--text-muted)] hover:text-[var(--text-main)] disabled:opacity-40 hover:bg-[var(--bg)] transition-all flex items-center gap-1 shadow-sm disabled:pointer-events-none"
            title="Next Page"
          >
            <span>Next</span>
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  </div>
);

  const renderUsers = () => (
    <div className="space-y-6">
       <header className="flex justify-between items-end">
          <div>
            <h2 className="text-2xl font-bold text-[var(--text-main)] tracking-tight">Authority Center</h2>
            <p className="text-sm text-[var(--text-muted)]">Personnel access control and regional assignment</p>
          </div>
          <button 
            onClick={() => setIsAddingUser(!isAddingUser)}
            className="bg-blue-600 text-white px-6 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-blue-600/20 flex items-center gap-2 hover:bg-blue-700 transition-all"
          >
            {isAddingUser ? <X size={18} /> : <UserPlus size={18} />}
            {isAddingUser ? 'Cancel Registration' : 'Register New Personnel'}
          </button>
       </header>

       <AnimatePresence>
         {emailStatus && !emailStatus.isReady && (
           <motion.div 
             initial={{ opacity: 0, y: -10 }}
             animate={{ opacity: 1, y: 0 }}
             className="mb-6 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/30 p-4 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4 transition-all hover:border-red-300"
           >
             <div className="flex items-center gap-3">
               <div className="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-xl flex items-center justify-center text-red-600 dark:text-red-400 shrink-0">
                 <ShieldAlert size={20} />
               </div>
               <div>
                 <h4 className="text-[11px] font-black text-red-800 dark:text-red-300 uppercase tracking-widest">Email Service Offline</h4>
                 <p className="text-[11px] text-red-700 dark:text-red-400 font-medium italic">{emailStatus.helpMessage || emailStatus.lastError || 'SMTP connection failed'}</p>
               </div>
             </div>
             <button 
               onClick={() => setActiveTab('settings')}
               className="w-full md:w-auto px-5 py-2 bg-red-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-red-700 transition-all shadow-lg shadow-red-600/20"
             >
               Configure Credentials
             </button>
           </motion.div>
         )}

         {createdUserTempPass && (
           <motion.div 
             initial={{ opacity: 0, scale: 0.95 }}
             animate={{ opacity: 1, scale: 1 }}
             className="mb-8 bg-orange-50 dark:bg-orange-900/20 border-2 border-orange-500/30 rounded-2xl p-6 relative overflow-hidden"
           >
             <div className="absolute right-0 top-0 p-2">
               <button onClick={() => setCreatedUserTempPass(null)} className="text-orange-500 hover:bg-orange-100 dark:hover:bg-orange-900/40 p-1 rounded-lg">
                 <X size={16} />
               </button>
             </div>
             <div className="flex gap-4 items-start">
               <div className="p-3 bg-orange-500 rounded-xl text-white shadow-lg shadow-orange-500/20">
                 <ShieldAlert size={24} />
               </div>
               <div>
                 <h4 className="text-orange-800 dark:text-orange-300 font-bold text-sm mb-1 uppercase tracking-tight">Manual Credential Delivery Required</h4>
                 <p className="text-orange-700 dark:text-orange-400 text-[11px] mb-4 max-w-xl">
                   The welcome email failed to send (SMTP 535). The user was created successfully, but you must manually provide these temporary credentials to the personnel.
                 </p>
                 <div className="flex flex-wrap gap-4">
                   <div className="bg-white dark:bg-slate-900 border border-orange-500/20 px-4 py-2 rounded-lg">
                     <span className="text-[9px] font-bold text-orange-500 block uppercase mb-0.5">Email (Login)</span>
                     <span className="font-mono text-sm dark:text-slate-200">{createdUserTempPass.email}</span>
                   </div>
                   <div className="bg-white dark:bg-slate-900 border border-orange-500/20 px-4 py-2 rounded-lg flex items-center justify-between gap-4">
                     <div>
                       <span className="text-[9px] font-bold text-orange-500 block uppercase mb-0.5">Temp Password</span>
                       <span className="font-mono text-sm dark:text-slate-200">{createdUserTempPass.pass}</span>
                     </div>
                     <button 
                       onClick={() => {
                         navigator.clipboard.writeText(`Email: ${createdUserTempPass.email}\nPassword: ${createdUserTempPass.pass}`);
                         alert('Credentials copied to clipboard');
                       }}
                       className="p-2 text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/40 rounded-lg transition-colors" title="Copy Credentials">
                       <Copy size={16} />
                     </button>
                   </div>
                 </div>
               </div>
             </div>
           </motion.div>
         )}

         {isAddingUser && (
           <motion.div 
             initial={{ opacity: 0, y: -20 }}
             animate={{ opacity: 1, y: 0 }}
             exit={{ opacity: 0, y: -20 }}
             className="bg-[var(--card)] border border-blue-500/20 rounded-2xl p-8 shadow-xl shadow-blue-900/5 transition-colors"
           >
              <h3 className="font-bold text-[var(--text-main)] text-sm mb-6 flex items-center gap-2">
                <ShieldCheck size={18} className="text-blue-600" />
                Initialize Personnel Credentials
              </h3>
              <form onSubmit={handleCreateUser} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div>
                  <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2">Display Name</label>
                  <input 
                    type="text"
                    required
                    value={newUser.displayName}
                    onChange={e => setNewUser({ ...newUser, displayName: e.target.value })}
                    className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm text-[var(--text-main)] focus:border-blue-500 outline-none transition-colors"
                    placeholder="Full Name"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2">Government Email</label>
                  <input 
                    type="email"
                    required
                    value={newUser.email}
                    onChange={e => setNewUser({ ...newUser, email: e.target.value })}
                    className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm text-[var(--text-main)] focus:border-blue-500 outline-none transition-colors"
                    placeholder="email@cda.gov.ph"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2">Access Role</label>
                  <select 
                    value={newUser.role}
                    onChange={e => setNewUser({ ...newUser, role: e.target.value as UserRole })}
                    className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm text-[var(--text-main)] focus:border-blue-500 outline-none appearance-none transition-colors"
                  >
                    <option value={UserRole.ANALYST}>Central Office Evaluator</option>
                    <option value={UserRole.REGIONAL_ANALYST}>Regional Office Evaluator</option>
                    {user?.role === UserRole.ADMIN && <option value={UserRole.ADMIN}>System Administrator</option>}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2">Unit Assignment (PSGC)</label>
                  <select 
                    value={newUser.region}
                    onChange={e => setNewUser({ ...newUser, region: e.target.value })}
                    className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm text-[var(--text-main)] focus:border-blue-500 outline-none appearance-none transition-colors"
                  >
                    <option value="">National Headquarters</option>
                    {PHILIPPINE_REGIONS.map(r => (
                      <option key={r.id} value={r.id}>{r.name} ({r.id})</option>
                    ))}
                  </select>
                </div>
                <div className="lg:col-span-4 flex justify-end gap-3 pt-4 border-t border-[var(--border)] transition-colors">
                   <button 
                    type="submit"
                    disabled={userActionLoading}
                    className="bg-slate-900 dark:bg-blue-600 text-white px-8 py-3 rounded-xl font-bold text-sm shadow-xl shadow-slate-900/10 hover:bg-slate-800 dark:hover:bg-blue-700 flex items-center gap-2 transition-all"
                   >
                     {userActionLoading ? <FuturisticLoader size={18} text="" /> : <ShieldCheck size={18} />}
                     Commit to Registry
                   </button>
                </div>
              </form>
           </motion.div>
         )}
       </AnimatePresence>

       {uploadMessage && (
         <motion.div 
           initial={{ opacity: 0, x: 20 }}
           animate={{ opacity: 1, x: 0 }}
           className={`p-4 rounded-2xl border flex items-center justify-between gap-4 transition-colors ${
             uploadMessage.type === 'success' ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-100 dark:border-green-800/50' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-100 dark:border-red-800/50'
           }`}
         >
           <div className="flex items-center gap-3 font-bold text-sm">
             {uploadMessage.type === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
             {uploadMessage.text}
           </div>
           <button onClick={() => setUploadMessage(null)} className="opacity-50 hover:opacity-100"><X size={14} /></button>
         </motion.div>
       )}

       <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-sm overflow-x-auto transition-colors">
          <table className="w-full text-left text-[12px] min-w-[800px]">
            <thead>
              <tr className="bg-[var(--bg)] border-b border-[var(--border)] text-[var(--text-muted)] font-bold uppercase tracking-widest transition-colors">
                <th className="px-6 py-4">Personnel</th>
                <th className="px-6 py-4">Access Role</th>
                <th className="px-6 py-4">Assigned Unit</th>
                <th className="px-6 py-4">Registered</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {usersLoading ? (
                <tr>
                  <td colSpan={5} className="p-32 text-center">
                    <FuturisticLoader size={120} text="SYNC REGISTRY" />
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={5} className="p-20 text-center text-[var(--text-muted)] font-medium italic transition-colors">No personnel found in current scope</td></tr>
              ) : users.map((u, i) => (
                <tr key={u._id || `user-${i}`} className={`border-b border-[var(--border)] hover:bg-[var(--bg)] transition-colors group ${!u.isActive ? 'opacity-60 bg-[var(--bg)]' : ''}`}>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                       {!u.isActive && <div className="px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 font-black text-[8px] uppercase tracking-tighter transition-colors">Deactivated</div>}
                       <div className="font-bold text-[var(--text-main)] group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors uppercase tracking-tight">{u.displayName}</div>
                    </div>
                    <div className="text-[10px] text-[var(--text-muted)] font-mono transition-colors">{u.email}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase transition-colors ${
                      u.role === UserRole.ADMIN ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400' : 'bg-[var(--header)] text-[var(--text-muted)]'
                    }`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-bold text-[var(--text-muted)] uppercase tracking-tighter transition-colors">
                    {u.region ? (
                      <div className="flex items-center gap-1.5">
                        <MapPin size={10} className="text-[var(--text-muted)] transition-colors" />
                        {PHILIPPINE_REGIONS.find(r => r.id === u.region)?.name} ({u.region})
                      </div>
                    ) : 'National Headquarters'}
                  </td>
                  <td className="px-6 py-4 text-[var(--text-muted)] tabular-nums transition-colors">
                    {new Date(u.createdAt || Date.now()).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button 
                        onClick={() => {
                          setEditingUser(u);
                          setEditFormData({ displayName: u.displayName, role: u.role, region: u.region || '' });
                        }}
                        className="p-2 text-[var(--text-muted)] hover:text-blue-600 dark:hover:text-blue-400 transition-all hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                        title="Update Registration"
                      >
                        <Settings size={16} />
                      </button>
                      <button 
                        onClick={() => handleToggleStatus(u)}
                        className={`p-2 transition-all rounded-lg transition-colors ${u.isActive ? 'text-[var(--text-muted)] hover:text-orange-600 dark:hover:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20' : 'text-[var(--text-muted)] hover:text-green-600 dark:hover:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20'}`}
                        title={u.isActive ? 'Deactivate Account' : 'Activate Account'}
                      >
                        {u.isActive ? <UserMinus size={16} /> : <UserCheck size={16} />}
                      </button>
                      <button 
                        onClick={() => setConfirmDelete(u)}
                        className="p-2 text-[var(--text-muted)] hover:text-red-600 dark:hover:text-red-400 transition-all hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                        title="Purge Personnel"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
       </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-[var(--bg)] overflow-hidden transition-colors duration-300">
      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsMobileMenuOpen(false)}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[55] lg:hidden"
          />
        )}
      </AnimatePresence>

      <aside className={`fixed inset-y-0 left-0 w-64 bg-[#0F172A] text-white flex flex-col p-6 shrink-0 z-[60] transition-transform duration-300 lg:relative lg:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between mb-10 px-2 lg:block">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center shadow-lg shadow-blue-600/20">
              <Shield size={18} className="text-white" />
            </div>
            <span className="font-bold tracking-tight text-lg uppercase truncate">CDA Monitoring</span>
          </div>
          <button onClick={() => setIsMobileMenuOpen(false)} className="lg:hidden p-2 text-slate-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 space-y-2 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-white/5">
          <SidebarItem icon={LayoutDashboard} label="Dashboard" id="dashboard" active={activeTab === 'dashboard'} />
          <SidebarItem icon={FileText} label="Report Repository" id="reports" active={activeTab === 'reports'} />
          <SidebarItem icon={Wrench} label="Report Builder" id="builder" active={activeTab === 'builder'} />
          <SidebarItem icon={MapPin} label="Geographic Map" id="map" active={activeTab === 'map'} />
          {user?.role === UserRole.ADMIN && (
            <>
              <SidebarItem icon={Users} label="Operator Registry" id="users" active={activeTab === 'users'} />
              <SidebarItem icon={FileUp} label="CSV Ingestion" id="ingest" active={activeTab === 'ingest'} />
              <SidebarItem icon={History} label="Personnel Audit" id="audit" active={activeTab === 'audit'} />
              <SidebarItem icon={Settings} label="System Settings" id="settings" active={activeTab === 'settings'} />
            </>
          )}
        </nav>

        <div className="mt-auto px-2 mb-6">
          <button 
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="w-full flex items-center justify-between p-3 rounded-xl bg-slate-800/50 hover:bg-slate-800 transition-all border border-slate-700/50 group"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-600/20 flex items-center justify-center text-blue-400 group-hover:scale-110 transition-transform">
                {isDarkMode ? <Moon size={16} /> : <Sun size={16} />}
              </div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 group-hover:text-white transition-colors">
                {isDarkMode ? 'Dark Mode' : 'Light Mode'}
              </span>
            </div>
            <div className={`w-10 h-5 rounded-full p-1 transition-colors ${isDarkMode ? 'bg-blue-600' : 'bg-slate-700'}`}>
              <div className={`w-3 h-3 bg-white rounded-full transition-transform ${isDarkMode ? 'translate-x-5' : 'translate-x-0'}`} />
            </div>
          </button>
        </div>

        <div className="mt-8 pt-8 border-t border-slate-800 space-y-6">
          <div className="flex items-center gap-3 px-2">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-lg shrink-0 shadow-lg shadow-blue-600/10">
              {user?.displayName?.charAt(0)}
            </div>
            <div className="overflow-hidden">
               <div className="flex items-center gap-2">
                  <span className="font-bold text-sm truncate">{user?.displayName || 'System'}</span>
                  <span className="bg-orange-500 text-[9px] font-black px-1.5 py-0.5 rounded text-white uppercase shrink-0">
                    {user?.role === UserRole.ADMIN ? 'ADMIN' : (user?.role?.includes('Regional') ? 'REG' : 'ANLYST')}
                  </span>
               </div>
               <div className="text-[10px] text-slate-500 truncate">{user?.email}</div>
            </div>
          </div>

          <button 
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-[11px] font-black text-red-400 hover:bg-red-500/10 transition-all border border-red-500/20 tracking-tighter"
          >
            <LogOut size={16} />
            <span>TERMINATE SESSION</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 relative h-full">
        {/* Mobile Header */}
        <div className="lg:hidden flex items-center justify-between mb-8 sticky top-0 bg-[var(--bg)]/80 backdrop-blur-md z-40 py-2 transition-colors">
           <button 
            onClick={() => setIsMobileMenuOpen(true)}
            className="p-3 bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-sm text-[var(--text-main)]"
          >
            <Menu size={20} />
          </button>
          
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="p-3 bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-sm text-[var(--text-main)] transition-colors"
            >
              {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center shadow-lg shadow-blue-600/20">
              <Shield size={16} className="text-white" />
            </div>
          </div>
          
          <button 
            onClick={() => {
              setShowNotifications(!showNotifications);
              if (!showNotifications) fetchNotifications();
            }}
            className="p-3 bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-sm text-[var(--text-muted)] relative transition-colors"
          >
            <Bell size={20} />
            {unreadNotifications > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-[var(--card)] transition-colors">
                {unreadNotifications}
              </span>
            )}
          </button>
        </div>

        {/* Global Notification Bell (Desktop) */}
        {!isMobileMenuOpen && (
          <div className="hidden lg:block fixed top-6 right-6 lg:top-8 lg:right-12 z-50">
            <div className="relative">
              <button 
                onClick={() => {
                  setShowNotifications(!showNotifications);
                  if (!showNotifications) fetchNotifications();
                }}
                className="p-3 bg-[var(--card)]/90 backdrop-blur-md border border-[var(--border)] rounded-2xl shadow-lg hover:shadow-xl text-[var(--text-muted)] hover:text-blue-600 dark:hover:text-blue-400 hover:scale-105 active:scale-95 transition-all hover:border-blue-500/20 dark:hover:border-blue-400/20"
                title="System Notifications"
              >
                <Bell size={20} />
                {unreadNotifications > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-600 border-2 border-[var(--card)] text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-md animate-pulse">
                    {unreadNotifications}
                  </span>
                )}
              </button>
            </div>
          </div>
        )}

        <AnimatePresence>
          {showNotifications && (
            <div className="fixed inset-0 z-[100] lg:absolute lg:inset-auto lg:right-6 lg:top-20 lg:block">
              {/* Overlay for mobile to close on backdrop click */}
              <div 
                className="fixed inset-0 bg-black/20 backdrop-blur-sm lg:hidden"
                onClick={() => setShowNotifications(false)}
              />
              
              <motion.div 
                 initial={{ opacity: 0, scale: 0.95, y: 10 }}
                 animate={{ opacity: 1, scale: 1, y: 0 }}
                 exit={{ opacity: 0, scale: 0.95, y: 10 }}
                 className="relative lg:absolute right-0 mx-4 mt-20 lg:mt-0 lg:mx-0 w-auto lg:w-90 bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-2xl z-50 overflow-hidden transition-colors max-w-[calc(100vw-32px)]"
              >
                <div className="p-4 border-b border-[var(--border)] flex items-center justify-between bg-[var(--bg)] transition-colors">
                  <div>
                    <h3 className="font-bold text-[var(--text-main)] text-sm">Notifications</h3>
                    {unreadNotifications > 0 && (
                      <p className="text-[10px] text-[var(--text-muted)] font-medium">{unreadNotifications} unread messages</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {unreadNotifications > 0 && (
                      <button 
                        onClick={markAllAsRead}
                        className="text-[10px] text-blue-600 dark:text-blue-400 font-bold uppercase tracking-wider hover:underline px-2 py-1 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all"
                      >
                        Mark All as Read
                      </button>
                    )}
                    <button 
                      onClick={() => setShowNotifications(false)}
                      className="lg:hidden p-1 text-[var(--text-muted)]"
                    >
                      <LogOut size={16} />
                    </button>
                  </div>
                </div>
                <div className="max-h-[60vh] lg:max-h-96 overflow-y-auto scrollbar-thin scrollbar-thumb-[var(--border)]">
                    {notifications.length === 0 ? (
                      <div className="p-10 text-center text-[var(--text-muted)] text-xs italic">
                        No new alerts
                      </div>
                    ) : (
                      notifications.map((n, i) => (
                        <div 
                          key={n._id || `notif-${i}`} 
                          onClick={() => !n.isRead && markAsRead(n._id)}
                          className={`p-4 border-b border-[var(--border)] cursor-pointer hover:bg-[var(--bg)] transition-colors relative group ${!n.isRead ? 'bg-blue-50/40 dark:bg-blue-900/10' : ''}`}
                        >
                          <div className="flex items-start gap-3">
                            <div className="relative">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                                n.type === 'STATUS_CHANGE' ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' :
                                n.type === 'NEW_REPORT' ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' :
                                'bg-slate-100 text-slate-600 dark:bg-slate-900/30 dark:text-slate-400'
                              }`}>
                                {n.type === 'STATUS_CHANGE' ? <RefreshCw size={14} /> : 
                                 n.type === 'NEW_REPORT' ? <FileText size={14} /> : 
                                 <Bell size={14} />}
                              </div>
                              {!n.isRead && (
                                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-blue-600 border-2 border-[var(--card)] rounded-full"></span>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <div className={`font-bold text-[var(--text-main)] text-xs truncate ${!n.isRead ? 'pr-8' : ''}`}>{n.title}</div>
                                {!n.isRead && (
                                  <span className="shrink-0 text-[8px] font-black bg-blue-600 text-white px-1.5 py-0.5 rounded uppercase tracking-tighter shadow-sm shadow-blue-600/20">New</span>
                                )}
                              </div>
                              <div className="text-[11px] text-[var(--text-muted)] mt-0.5 line-clamp-2 leading-snug">{n.message}</div>
                              <div className="flex items-center justify-between mt-2">
                                <div className="text-[9px] text-[var(--text-muted)] font-mono uppercase opacity-70">
                                  {new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                                {!n.isRead && (
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      markAsRead(n._id);
                                    }}
                                    className="text-[9px] font-bold text-blue-600 dark:text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity uppercase tracking-tighter"
                                  >
                                    Mark as read
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.2 }}
            className="pb-20 md:pb-0"
          >
            {activeTab === 'dashboard' && renderDashboard()}
            {activeTab === 'reports' && renderReports()}
            {activeTab === 'builder' && renderBuilder()}
            {activeTab === 'map' && <MapVisualizer user={user} token={token} />}
            {user?.role === UserRole.ADMIN && (
              <>
                {activeTab === 'users' && renderUsers()}
                {activeTab === 'ingest' && renderIngest()}
                {activeTab === 'audit' && renderAudit()}
                {activeTab === 'settings' && renderSettings()}
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

  <AnimatePresence>
    {editingUser && (
      <div className="fixed inset-0 bg-[#0F172A]/80 z-[70] flex items-center justify-center p-4 backdrop-blur-sm">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="bg-[var(--card)] border border-[var(--border)] rounded-3xl shadow-2xl max-w-sm w-full overflow-hidden transition-colors"
        >
          <header className="px-6 py-4 border-b border-[var(--border)] flex justify-between items-center bg-[var(--bg)] transition-colors">
            <h3 className="font-bold text-[var(--text-main)] text-sm">Update Personnel Access</h3>
            <button onClick={() => setEditingUser(null)} className="text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors">
              <X size={18} />
            </button>
          </header>
          <form onSubmit={handleUpdateUserDetails} className="p-6 space-y-6">
            <div>
              <div className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1">Account Target</div>
              <div className="text-[10px] text-[var(--text-muted)] font-mono mb-2">{editingUser.email}</div>
              
              <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2">Display Name</label>
              <input 
                type="text"
                required
                value={editFormData.displayName}
                onChange={e => setEditFormData({ ...editFormData, displayName: e.target.value })}
                className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm text-[var(--text-main)] focus:border-blue-500 outline-none transition-colors"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2">Access Role</label>
              <select 
                value={editFormData.role}
                onChange={e => setEditFormData({ ...editFormData, role: e.target.value as UserRole })}
                className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm text-[var(--text-main)] focus:border-blue-500 outline-none transition-colors appearance-none"
              >
                <option value={UserRole.ANALYST}>Central Office Evaluator</option>
                <option value={UserRole.REGIONAL_ANALYST}>Regional Office Evaluator</option>
                {user?.role === UserRole.ADMIN && <option value={UserRole.ADMIN}>System Administrator</option>}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2">Regional Assignment</label>
              <select 
                value={editFormData.region}
                onChange={e => setEditFormData({ ...editFormData, region: e.target.value })}
                className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm text-[var(--text-main)] focus:border-blue-500 outline-none transition-colors appearance-none"
              >
                <option value="">National Headquarters</option>
                {PHILIPPINE_REGIONS.map(r => (
                  <option key={r.id} value={r.id}>{r.name} ({r.id})</option>
                ))}
              </select>
            </div>

            <div className="pt-4 flex gap-3">
               <button 
                type="button"
                onClick={() => setEditingUser(null)}
                className="flex-1 px-4 py-3 border border-[var(--border)] text-[var(--text-muted)] rounded-xl font-bold text-sm hover:bg-[var(--bg)] transition-colors"
               >
                 Discard
               </button>
               <button 
                type="submit"
                disabled={userActionLoading}
                className="flex-1 bg-blue-600 text-white px-4 py-3 rounded-xl font-bold text-sm shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2"
               >
                 {userActionLoading ? <FuturisticLoader size={18} text="" /> : <ShieldCheck size={18} />}
                 Save Changes
               </button>
            </div>
          </form>
        </motion.div>
      </div>
    )}
  </AnimatePresence>

  <AnimatePresence>
    {showUpdateConfirm && editingUser && (
      <div className="fixed inset-0 bg-[#0F172A]/90 z-[80] flex items-center justify-center p-4 backdrop-blur-md">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className="bg-[var(--card)] border border-blue-500/20 rounded-3xl shadow-2xl max-w-sm w-full p-8 text-center transition-colors"
        >
          <div className="w-16 h-16 bg-blue-50 dark:bg-blue-900/30 rounded-full flex items-center justify-center text-blue-600 dark:text-blue-400 mx-auto mb-6 transition-colors">
            <ShieldCheck size={32} />
          </div>
          <h3 className="text-xl font-bold text-[var(--text-main)] mb-2">Confirm Authorization Change?</h3>
          <p className="text-[var(--text-muted)] text-sm mb-8 leading-relaxed">
            You are about to update the access levels for <span className="font-bold text-[var(--text-main)]">{editingUser.displayName} ({editingUser.email})</span>.
            <br />
            <span className="block mt-2 font-mono text-[10px] bg-[var(--bg)] p-2 rounded-lg border border-[var(--border)] overflow-hidden text-ellipsis italic">
              New assignment: {editFormData.role} in {editFormData.region || 'National Headquarters'}
            </span>
          </p>
          <div className="flex gap-4">
            <button 
              onClick={() => setShowUpdateConfirm(false)}
              className="flex-1 px-6 py-3 border border-[var(--border)] text-[var(--text-muted)] rounded-xl font-bold text-sm hover:bg-[var(--bg)] transition-colors"
            >
              Cancel
            </button>
            <button 
              onClick={confirmUpdateDetails}
              disabled={userActionLoading}
              className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-xl font-bold text-sm shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2"
            >
              {userActionLoading ? <FuturisticLoader size={18} text="" /> : 'Confirm Change'}
            </button>
          </div>
        </motion.div>
      </div>
    )}
  </AnimatePresence>

  <AnimatePresence>
    {confirmDelete && (
      <div className="fixed inset-0 bg-[#0F172A]/90 z-[80] flex items-center justify-center p-4 backdrop-blur-md">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className="bg-[var(--card)] border border-red-500/20 rounded-3xl shadow-2xl max-w-sm w-full p-8 text-center transition-colors"
        >
          <div className="w-16 h-16 bg-red-50 dark:bg-red-900/30 rounded-full flex items-center justify-center text-red-600 dark:text-red-400 mx-auto mb-6 transition-colors">
            <Trash2 size={32} />
          </div>
          <h3 className="text-xl font-bold text-[var(--text-main)] mb-2">Purge Personnel Record?</h3>
          <p className="text-[var(--text-muted)] text-sm mb-8 leading-relaxed">
            You are about to permanently delete <span className="font-bold text-[var(--text-main)]">{confirmDelete.displayName}</span> from the registry. This action is irreversible.
          </p>
          <div className="flex gap-4">
            <button 
              onClick={() => setConfirmDelete(null)}
              className="flex-1 px-6 py-3 border border-[var(--border)] text-[var(--text-muted)] rounded-xl font-bold text-sm hover:bg-[var(--bg)] transition-colors"
            >
              Cancel
            </button>
            <button 
              onClick={() => handleDeleteUser(confirmDelete._id || confirmDelete.id as string)}
              disabled={userActionLoading}
              className="flex-1 bg-red-600 text-white px-6 py-3 rounded-xl font-bold text-sm shadow-lg shadow-red-600/20 flex items-center justify-center gap-2"
            >
              {userActionLoading ? <FuturisticLoader size={18} text="" /> : 'Purge Record'}
            </button>
          </div>
        </motion.div>
      </div>
    )}
  </AnimatePresence>
  <AnimatePresence>
        {selectedReport && (
          <div className="fixed inset-0 bg-[#0F172A]/80 z-[70] flex items-center justify-center p-4 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-[var(--card)] border border-[var(--border)] rounded-3xl shadow-2xl max-w-5xl w-full max-h-[90vh] md:max-h-[85vh] flex flex-col overflow-hidden transition-colors"
            >
              <header className="px-8 py-6 border-b border-[var(--border)] flex justify-between items-center bg-[var(--bg)] transition-colors">
                <div>
                   <h3 className="text-xl font-bold text-[var(--text-main)] transition-colors">{selectedReport.cooperativeName}</h3>
                   <p className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-widest mt-1 transition-colors">Registry Record Details</p>
                </div>
                <button 
                  onClick={() => {
                    setSelectedReport(null);
                    setUploadMessage(null);
                  }}
                  className="w-10 h-10 rounded-full flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--bg)] hover:text-[var(--text-main)] transition-all"
                >
                  <X size={20} />
                </button>
              </header>

              <div className="flex-1 overflow-y-auto p-8 scrollbar-thin scrollbar-thumb-[var(--border)]">
                {uploadMessage && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`mb-6 p-4 rounded-2xl border flex items-center justify-between gap-4 ${
                      uploadMessage.type === 'success' ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-100 dark:border-green-800/50' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-100 dark:border-red-800/50'
                    }`}
                  >
                    <div className="flex items-center gap-3 font-bold text-sm">
                      {uploadMessage.type === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                      {uploadMessage.text}
                    </div>
                    <button onClick={() => setUploadMessage(null)} className="opacity-50 hover:opacity-100"><X size={14} /></button>
                  </motion.div>
                )}
                {/* Identity & Location Section */}
                <div className="mb-10">
                  <div className="flex items-center gap-2 mb-4">
                    <MapPin size={14} className="text-blue-600 dark:text-blue-400" />
                    <h4 className="text-[12px] font-bold text-[var(--text-main)] uppercase tracking-widest">Cooperative Identity & Location</h4>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-6 bg-[var(--bg)] p-6 rounded-2xl border border-[var(--border)] transition-colors">
                    <div>
                      <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1">Registration #</label>
                      <div className="font-mono text-xs font-bold text-[var(--text-main)]">{selectedReport.registrationNumber}</div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1">Region</label>
                      <div className="text-xs font-bold text-[var(--text-main)]">{selectedReport.region || selectedReport.parsedData?.["Region"] || 'N/A'}</div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1">Province</label>
                      <div className="text-xs font-bold text-[var(--text-main)]">{selectedReport.parsedData?.["Province"] || 'N/A'}</div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1">Municipality</label>
                      <div className="text-xs font-bold text-[var(--text-main)]">{selectedReport.municipality || selectedReport.parsedData?.["Municipality"] || selectedReport.parsedData?.["City/Municipality"] || 'N/A'}</div>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1">Street Address</label>
                      <div className="text-xs font-bold text-[var(--text-main)]">{selectedReport.parsedData?.["Street"] || 'N/A'}</div>
                    </div>
                  </div>
                </div>

                {/* Classification & Assets Section */}
                <div className="mb-10">
                  <div className="flex items-center gap-2 mb-4">
                    <Shield size={14} className="text-blue-600 dark:text-blue-400" />
                    <h4 className="text-[12px] font-bold text-[var(--text-main)] uppercase tracking-widest">Classification & Financials</h4>
                  </div>
                  <div className="grid grid-cols-2 gap-6 bg-[var(--card)] p-6 rounded-2xl border border-[var(--border)] shadow-sm transition-colors">
                    <div>
                      <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1">Cooperative Type</label>
                      {user?.role !== UserRole.VIEWER ? (
                        <select 
                          value={cooperativeTypeEdit}
                          onChange={(e) => setCooperativeTypeEdit(e.target.value)}
                          className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-[11px] font-bold text-[var(--text-main)] outline-none focus:border-blue-500 transition-all appearance-none"
                        >
                          <option value="">Select Type</option>
                          {ALL_COOP_TYPES.map(type => (
                            <option key={type} value={type}>{type}</option>
                          ))}
                        </select>
                      ) : (
                        <div className="text-xs font-bold text-[var(--text-main)]">{selectedReport.cooperativeType || selectedReport.parsedData?.["Cooperative Type"] || 'N/A'}</div>
                      )}
                    </div>
                    {cooperativeTypeEdit === 'Multipurpose' && (
                       <div>
                         <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1">Specific Cooperative Type</label>
                         {user?.role !== UserRole.VIEWER ? (
                           <select 
                             value={specificType}
                             onChange={(e) => setSpecificType(e.target.value)}
                             className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-[11px] font-bold text-[var(--text-main)] outline-none focus:border-blue-500 transition-all appearance-none"
                           >
                             <option value="">Select Specific Type</option>
                             {ALL_COOP_TYPES.filter(t => t !== 'Multipurpose').map(type => (
                               <option key={type} value={type}>{type}</option>
                             ))}
                           </select>
                         ) : (
                           <div className="text-xs font-bold text-[var(--text-main)]">{selectedReport.specificType || 'N/A'}</div>
                         )}
                       </div>
                    )}
                    <div>
                      <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1">Category</label>
                      <div className="text-xs font-bold text-[var(--text-main)]">{selectedReport.parsedData?.["Category"] || 'N/A'}</div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1">Asset Size 2025</label>
                      <div className="text-xs font-mono font-bold text-[var(--text-main)]">{selectedReport.parsedData?.["Asset Size 2025"] ? `₱${Number(selectedReport.parsedData["Asset Size 2025"]).toLocaleString()}` : 'N/A'}</div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1">Asset Size 2026 (Projected)</label>
                      <div className="text-xs font-mono font-bold text-[var(--text-main)]">{selectedReport.parsedData?.["Asset Size 2026"] ? `₱${Number(selectedReport.parsedData["Asset Size 2026"]).toLocaleString()}` : 'N/A'}</div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1">Cooperative Cluster</label>
                      <div className="text-xs font-bold text-blue-600 dark:text-blue-400">
                        {(() => {
                           let type = cooperativeTypeEdit;
                           if (type === 'Multipurpose' && specificType) {
                             type = specificType;
                           }
                           
                           if (!type) return selectedReport.cooperativeCluster || 'Auto-assigned';
                           
                           for (const cluster of COOPERATIVE_CLUSTERS) {
                             if (cluster.types.some(t => t.toLowerCase() === type.toLowerCase())) {
                               return cluster.name;
                             }
                           }
                           return 'Others';
                        })()}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Compliance Findings Grid */}
                <div className="mb-10">
                  <div className="flex flex-col gap-4 mb-6">
                    <div className="flex items-center gap-2">
                       <AlertTriangle size={14} className="text-blue-600 dark:text-blue-400" />
                       <h4 className="text-[12px] font-bold text-[var(--text-main)] uppercase tracking-widest">Compliance Status and Findings</h4>
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-3 bg-[var(--bg)] p-1.5 rounded-xl border border-[var(--border)] self-start transition-colors w-[942.844px] h-[66.5px]">
                      <div className="flex flex-wrap p-0.5 bg-[var(--card)] rounded-lg border border-[var(--border)] shadow-sm gap-0.5 transition-colors w-[700px] h-[43.5px] items-center">
                        {[
                          'For Evaluation',
                          'Approved for Payment',
                          'Issued COC',
                          'Approved',
                          'Deferred'
                        ].map((status) => (
                          <button 
                            key={status}
                            onClick={() => setComplianceStatus(status as any)}
                            className={`px-3 py-1.5 text-[12px] font-black uppercase tracking-tighter rounded-md transition-all ${
                              complianceStatus === status 
                                ? 'bg-blue-600 text-white shadow-md' 
                                : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
                            }`}
                          >
                            {status}
                          </button>
                        ))}
                      </div>
                      
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 dark:bg-slate-800/50 border border-[var(--border)] rounded-lg ml-[15px] transition-all hover:border-blue-400 dark:hover:border-blue-500/50 w-[160px]">
                        <Clock size={12} className="text-blue-500 dark:text-blue-400 shrink-0" />
                        <input 
                          type="date" 
                          value={complianceDate}
                          onChange={(e) => setComplianceDate(e.target.value)}
                          className="bg-transparent text-[11px] font-black text-slate-700 dark:text-slate-200 outline-none cursor-pointer w-full"
                        />
                      </div>
                    </div>

                    <div className="mt-4">
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Validation Message / Evaluation Remarks</label>
                        {user?.role !== UserRole.VIEWER && (
                          <button 
                            onClick={handleAiSuggestMain}
                            disabled={isAiThinking === 'main'}
                            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-all text-[10px] font-black uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-blue-500/20"
                          >
                            {isAiThinking === 'main' ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <Sparkles size={12} />
                            )}
                            Synthesize with AI
                          </button>
                        )}
                      </div>
                      {user?.role !== UserRole.VIEWER ? (
                        <textarea 
                          value={evaluationRemarks}
                          onChange={(e) => {
                            setEvaluationRemarks(e.target.value);
                            e.target.style.height = 'auto';
                            e.target.style.height = `${e.target.scrollHeight}px`;
                          }}
                          onFocus={(e) => {
                            e.target.style.height = 'auto';
                            e.target.style.height = `${e.target.scrollHeight}px`;
                          }}
                          placeholder="Enter validation message or evaluation remarks for this record..."
                          className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm outline-none focus:border-blue-500 transition-all min-h-[100px] text-[var(--text-main)] resize-none overflow-hidden"
                        />
                      ) : (
                        <div className="w-full bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800 rounded-xl px-4 py-3 text-sm text-[var(--text-main)] min-h-[60px] italic">
                          {evaluationRemarks || 'No validation message provided yet.'}
                        </div>
                      )}
                    </div>

                  </div>

                  {/* Unified Document Checklist & Findings */}
                  <AnimatePresence>
                    {complianceStatus === 'Deferred' && (
                      <motion.div 
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="space-y-6 mb-10"
                      >
                        {/* 15-Day Timeline View */}
                        {complianceDate && (
                          <div className="p-6 bg-amber-50/50 dark:bg-amber-900/10 border border-amber-200/50 dark:border-amber-800/30 rounded-2xl transition-all shadow-sm overflow-x-auto">
                            <div className="flex items-center justify-between mb-8 min-w-[600px]">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
                                  <Clock size={16} className="text-amber-600 dark:text-amber-400" />
                                </div>
                                <div>
                                  <h5 className="text-[12px] font-black text-amber-900 dark:text-amber-200 uppercase tracking-widest leading-none mb-1">Compliance Timeline</h5>
                                  <p className="text-[10px] font-bold text-amber-600/70 dark:text-amber-400/60 uppercase">15-Day Grace Period Active</p>
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-[9px] font-bold text-amber-500 uppercase tracking-tighter mb-1">Due Date</div>
                                <div className="text-sm font-black text-amber-700 dark:text-amber-300 font-mono">
                                  {new Date(new Date(complianceDate).getTime() + 15 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                </div>
                              </div>
                            </div>
                            
                            <div className="relative px-2 min-w-[600px]">
                              {/* Connector Line */}
                              <div className="absolute top-1/2 left-0 w-full h-[2px] bg-amber-200 dark:bg-amber-800/50 -translate-y-1/2" />
                              
                              <div className="flex justify-between relative z-10">
                                {Array.from({ length: 16 }, (_, i) => i).map((day) => {
                                  const date = new Date(complianceDate);
                                  date.setDate(date.getDate() + day);
                                  const today = new Date();
                                  today.setHours(0, 0, 0, 0);
                                  const dateAtMidnight = new Date(date);
                                  dateAtMidnight.setHours(0, 0, 0, 0);
                                  
                                  const isToday = today.getTime() === dateAtMidnight.getTime();
                                  const isPast = today.getTime() > dateAtMidnight.getTime();
                                  const isDue = day === 15;
                                  
                                  return (
                                    <div key={day} className="flex flex-col items-center gap-3">
                                      <div className={`relative group ${isDue ? 'scale-110' : ''}`}>
                                        <div className={`w-3.5 h-3.5 rounded-full border-2 transition-all duration-500 ${
                                          isToday ? 'bg-amber-600 border-white scale-125 shadow-[0_0_15px_rgba(217,119,6,0.5)]' :
                                          isPast ? 'bg-amber-200 border-amber-300 dark:bg-amber-900/40 dark:border-amber-800' :
                                          isDue ? 'bg-white border-amber-500 dark:bg-slate-800 pulse-amber' :
                                          'bg-white border-amber-200 dark:bg-slate-800 dark:border-amber-900'
                                        }`} />
                                        
                                        {/* Status tooltip-like indicator */}
                                        {isToday && (
                                          <div className="absolute -top-1 left-1/2 -translate-x-1/2 -translate-y-full mb-2">
                                            <div className="bg-amber-600 text-white text-[7px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter whitespace-nowrap">Current</div>
                                          </div>
                                        )}
                                      </div>
                                      
                                      <div className="flex flex-col items-center">
                                        <span className={`text-[8px] font-black tracking-tighter uppercase transition-colors ${
                                          isToday ? 'text-amber-600' : isDue ? 'text-amber-700 dark:text-amber-400' : 'text-slate-400'
                                        }`}>
                                          {isDue ? 'Final' : day === 0 ? 'Start' : `D${day}`}
                                        </span>
                                        <span className="text-[7px] font-mono text-slate-400 font-medium">
                                          {date.toLocaleDateString('en-US', { day: '2-digit' })}
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        )}

                        <div className="space-y-3">
                          {[
                            { id: 'CAPR', label: 'Cooperative Annual Progress Report', short: 'CAPR', findingsKey: 'Summary of findings' },
                            { id: 'AFS', label: 'Audited Financial Statement', short: 'AFS', findingsKey: 'Summary of findings_5' },
                            { id: 'SAR', label: 'Social Audit Report', short: 'SAR', findingsKey: 'Summary of findings_2' },
                            { id: 'PAR', label: 'Performance Audit Report', short: 'PAR', findingsKey: 'Summary of findings_3' },
                            { id: 'SWORN STATEMENT AFFIDAVIT', label: 'Sworn Statement', short: 'SWORN', findingsKey: 'Summary of findings_6' },
                            { id: 'MEDCON', label: 'Mediation and Conciliation', short: 'MEDCON', findingsKey: 'Summary of findings_4' },
                          ].map((doc) => {
                            const data = documentFindings[doc.id] || { value: 'Not Complying', findings: 'No specific findings documented.' };
                            const isComplying = data.value?.toLowerCase().includes('comply') && !data.value?.toLowerCase().includes('not');
                            
                            const handleToggle = () => {
                              if (user?.role === UserRole.VIEWER) return;
                              setDocumentFindings(prev => ({
                                ...prev,
                                [doc.id]: {
                                  ...prev[doc.id],
                                  value: isComplying ? 'Not Complying' : 'Complying'
                                }
                              }));
                            };

                            const handleFindingsChange = (val: string) => {
                              setDocumentFindings(prev => ({
                                ...prev,
                                [doc.id]: {
                                  ...prev[doc.id],
                                  findings: val
                                }
                              }));
                            };

                            return (
                              <div key={doc.id} className="p-4 bg-[var(--bg)] border border-[var(--border)] rounded-xl transition-all hover:border-blue-300/50 dark:hover:border-blue-700/30 group">
                                <div className="flex items-center justify-between mb-3">
                                  <div 
                                    className={`flex items-center gap-3 cursor-pointer ${user?.role === UserRole.VIEWER ? 'cursor-default' : ''}`}
                                    onClick={handleToggle}
                                  >
                                    <div className={`flex-shrink-0 w-6 h-6 rounded-lg flex items-center justify-center border transition-all duration-300 ${
                                      isComplying 
                                        ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-500/20 scale-105' 
                                        : 'bg-[var(--card)] border-[var(--border)] text-transparent group-hover:border-blue-400'
                                    }`}>
                                      <CheckCircle2 size={14} strokeWidth={3} />
                                    </div>
                                    <div className="flex flex-col">
                                      <span className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest leading-none mb-1">{doc.short}</span>
                                      <span className="text-[13px] font-bold text-[var(--text-main)] group-hover:text-blue-500 transition-colors uppercase tracking-tight">{doc.label}</span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${
                                      isComplying 
                                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800/50' 
                                        : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/50'
                                    }`}>
                                      {data.value}
                                    </span>
                                  </div>
                                </div>
                                
                                <div className="mt-3 pl-9">
                                  <div className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2 flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                      <FileText size={10} className="text-blue-500" />
                                      Summary of Findings
                                    </div>
                                    {user?.role !== UserRole.VIEWER && (
                                      <button 
                                        onClick={() => handleAiSuggest(doc.id, doc.label)}
                                        disabled={isAiThinking === doc.id}
                                        className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-all text-[9.5px] font-black uppercase tracking-tighter cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed group/btn"
                                      >
                                        {isAiThinking === doc.id ? (
                                          <Loader2 size={10} className="animate-spin" />
                                        ) : (
                                          <Sparkles size={10} className="group-hover/btn:scale-125 transition-transform" />
                                        )}
                                        AI Suggest
                                      </button>
                                    )}
                                  </div>
                                  {user?.role !== UserRole.VIEWER ? (
                                    <textarea 
                                      value={data.findings}
                                      onChange={(e) => {
                                        handleFindingsChange(e.target.value);
                                        e.target.style.height = 'auto';
                                        e.target.style.height = `${e.target.scrollHeight}px`;
                                      }}
                                      onFocus={(e) => {
                                        e.target.style.height = 'auto';
                                        e.target.style.height = `${e.target.scrollHeight}px`;
                                      }}
                                      className="w-full p-3 bg-[var(--card)] border border-[var(--border)] rounded-lg text-[12px] text-[var(--text-main)] leading-relaxed outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 transition-all min-h-[60px] resize-none overflow-hidden"
                                      placeholder="Add specific findings or notes..."
                                    />
                                  ) : (
                                    <div className="p-3 bg-slate-50 dark:bg-slate-900/40 border border-[var(--border)] rounded-lg text-[12px] text-[var(--text-muted)] leading-relaxed italic">
                                      {data.findings || 'No findings recorded.'}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
                          <div className="p-4 bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-sm">
                            <label className="block text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-3 flex items-center gap-2">
                              <Eye size={12} className="text-blue-500" />
                              Date Inspected
                            </label>
                            {user?.role !== UserRole.VIEWER ? (
                              <input 
                                type="date"
                                value={dateInspected}
                                onChange={(e) => setDateInspected(e.target.value)}
                                className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-[12px] font-bold text-[var(--text-main)] outline-none focus:border-blue-500 transition-all"
                              />
                            ) : (
                              <div className="text-[12px] font-bold text-[var(--text-main)]">{dateInspected || 'N/A'}</div>
                            )}
                          </div>

                          <div className="p-4 bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-sm">
                            <label className="block text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-3 flex items-center gap-2">
                              <ShieldCheck size={12} className="text-blue-500" />
                              Inspection Status
                            </label>
                            {user?.role !== UserRole.VIEWER ? (
                              <select 
                                value={inspectionStatus}
                                onChange={(e) => setInspectionStatus(e.target.value)}
                                className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-[12px] font-bold text-[var(--text-main)] outline-none focus:border-blue-500 transition-all appearance-none"
                              >
                                <option value="">Select Status</option>
                                <option value="Complied">Complied</option>
                                <option value="Not Complied">Not Complied</option>
                                <option value="Subject for Inspection">Subject for Inspection</option>
                                <option value="Inspection Ongoing">Inspection Ongoing</option>
                              </select>
                            ) : (
                              <div className="text-[12px] font-bold text-[var(--text-main)]">{inspectionStatus || 'N/A'}</div>
                            )}
                          </div>

                          <div className="p-4 bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-sm">
                            <label className="block text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-3 flex items-center gap-2">
                              <FileText size={12} className="text-blue-500" />
                              Date Issued/Recommended
                            </label>
                            {user?.role !== UserRole.VIEWER ? (
                              <input 
                                type="date"
                                value={dateIssuedRecommended}
                                onChange={(e) => setDateIssuedRecommended(e.target.value)}
                                className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-[12px] font-bold text-[var(--text-main)] outline-none focus:border-blue-500 transition-all"
                              />
                            ) : (
                              <div className="text-[12px] font-bold text-[var(--text-main)]">{dateIssuedRecommended || 'N/A'}</div>
                            )}
                          </div>

                          <div className="p-4 bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-sm">
                            <label className="block text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-3 flex items-center gap-2">
                              <CheckCircle2 size={12} className="text-blue-500" />
                              Date complied to OTC and SCO
                            </label>
                            {user?.role !== UserRole.VIEWER ? (
                              <input 
                                type="date"
                                value={dateCompliedToOTCandSCO}
                                onChange={(e) => setDateCompliedToOTCandSCO(e.target.value)}
                                className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-[12px] font-bold text-[var(--text-main)] outline-none focus:border-blue-500 transition-all"
                              />
                            ) : (
                              <div className="text-[12px] font-bold text-[var(--text-main)]">{dateCompliedToOTCandSCO || 'N/A'}</div>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Raw Ingestion Data Section */}
                <div className="mb-10">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                       <Terminal size={14} className="text-blue-600 dark:text-blue-400" />
                       <h4 className="text-[12px] font-bold text-[var(--text-main)] uppercase tracking-widest">Full Ingestion Manifest</h4>
                    </div>
                    <span className="text-[9px] font-black text-[var(--text-muted)] uppercase bg-[var(--bg)] px-2 py-1 rounded border border-[var(--border)]">
                      {Object.keys(selectedReport.parsedData || {}).length} Fields Captured
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 bg-[var(--bg)] p-6 rounded-2xl border border-[var(--border)] transition-colors">
                    {Object.entries(selectedReport.parsedData || {}).map(([key, value]) => (
                      <div key={key} className="p-3 bg-[var(--card)] rounded-xl border border-[var(--border)] transition-colors">
                        <label className="block text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest truncate mb-1" title={key}>{key}</label>
                        <div className="text-[11px] font-medium text-[var(--text-main)] transition-colors truncate" title={String(value)}>{String(value) || <span className="opacity-30 italic">Empty</span>}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Timeline & Penalties Section - High Fidelity Styling */}
                <div className="mb-12 relative">
                   <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-orange-500/10 rounded-xl text-orange-600 dark:text-orange-400">
                          <History size={16} strokeWidth={2.5} />
                        </div>
                        <h4 className="text-[13px] font-black text-[var(--text-main)] uppercase tracking-[0.15em] transition-colors group-hover:text-orange-500">Timeline & Penalties</h4>
                      </div>
                      <div className="flex items-center gap-2 px-3 py-1 bg-slate-100 dark:bg-slate-800/50 rounded-full border border-[var(--border)]">
                        <div className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
                        <span className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest">Computed Live</span>
                      </div>
                   </div>

                   <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <motion.div 
                        whileHover={{ y: -4, scale: 1.02 }}
                        className="p-5 bg-gradient-to-br from-orange-50/80 to-white dark:from-orange-950/20 dark:to-[var(--card)] rounded-2xl border border-orange-200 dark:border-orange-800/40 shadow-sm transition-all"
                      >
                        <div className="flex items-center gap-2 mb-4">
                          <div className="p-1.5 bg-orange-100 dark:bg-orange-900/40 rounded-lg text-orange-600 dark:text-orange-400"><Clock size={14} /></div>
                          <label className="text-[10px] font-black text-orange-600/70 dark:text-orange-500/60 uppercase tracking-widest">Delayed Days</label>
                        </div>
                        <div className="text-3xl font-black text-orange-700 dark:text-orange-300 tracking-tight">
                          {selectedReport.parsedData?.["Number of days delayed"] || '0'}
                          <span className="text-[10px] ml-1 font-bold opacity-60">DAYS</span>
                        </div>
                        <div className="h-1 w-full bg-orange-200/30 dark:bg-orange-800/20 rounded-full mt-4 overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: selectedReport.parsedData?.["Number of days delayed"] > 0 ? '100%' : '0%' }}
                            className="h-full bg-orange-500"
                          />
                        </div>
                      </motion.div>

                      <motion.div 
                        whileHover={{ y: -4, scale: 1.02 }}
                        className="p-5 bg-gradient-to-br from-red-50/80 to-white dark:from-red-950/20 dark:to-[var(--card)] rounded-2xl border border-red-200 dark:border-red-800/40 shadow-sm transition-all"
                      >
                        <div className="flex items-center gap-2 mb-4">
                          <div className="p-1.5 bg-red-100 dark:bg-red-900/40 rounded-lg text-red-600 dark:text-red-400"><Shield size={14} /></div>
                          <label className="text-[10px] font-black text-red-600/70 dark:text-red-500/60 uppercase tracking-widest">Total Penalty</label>
                        </div>
                        <div className="text-3xl font-black text-red-700 dark:text-red-300 tracking-tight flex items-baseline gap-1">
                          <span className="text-lg opacity-60">₱</span>
                          {selectedReport.parsedData?.["Amount of penalty"] || '0.00'}
                        </div>
                        <p className="text-[9px] font-bold text-red-400 uppercase mt-4">Fixed Rate: ₱100/Day</p>
                      </motion.div>

                      <motion.div 
                        whileHover={{ y: -4, scale: 1.02 }}
                        className="md:col-span-2 p-5 bg-gradient-to-br from-blue-50/80 to-white dark:from-blue-950/20 dark:to-[var(--card)] rounded-2xl border border-blue-200 dark:border-blue-800/40 shadow-sm transition-all flex flex-col justify-between"
                      >
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2">
                            <div className="p-1.5 bg-blue-100 dark:bg-blue-900/40 rounded-lg text-blue-600 dark:text-blue-400"><CheckCircle2 size={14} /></div>
                            <label className="text-[10px] font-black text-blue-600/70 dark:text-blue-500/60 uppercase tracking-widest">COC Issuance Status</label>
                          </div>
                          {selectedReport.parsedData?.["Date Issued COC"] && (
                            <span className="text-[9px] font-black bg-blue-600 text-white px-2 py-0.5 rounded uppercase">Released</span>
                          )}
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-xl font-black text-blue-700 dark:text-blue-300">
                            {selectedReport.parsedData?.["Date Issued COC"] || 'Pending Issuance'}
                          </div>
                        </div>
                        <div className="text-[9px] font-bold text-blue-400 uppercase mt-4 flex items-center gap-1">
                          <Terminal size={10} />
                          Finalizing certificate of compliance...
                        </div>
                      </motion.div>
                   </div>
                </div>

                {/* Sectoral Status */}
                <div className="mb-10">
                   <div className="flex items-center gap-2 mb-4">
                      <Terminal size={14} className="text-blue-600 dark:text-blue-400" />
                      <h4 className="text-[12px] font-bold text-[var(--text-main)] uppercase tracking-widest">Sectoral & Operational Status</h4>
                   </div>
                   <div className="bg-slate-900 rounded-3xl p-8 relative overflow-hidden transition-colors">
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative z-10">
                        {selectedReport.parsedData && Object.entries(selectedReport.parsedData)
                          .filter(([k, v]) => (k.includes('Public') || k.includes('Human') || k.includes('Agriculture') || k.includes('Banking') || k.includes('Education')) && v)
                          .map(([k, v]) => (
                            <div key={k} className="flex flex-col gap-1 border-l-2 border-blue-500 pl-4 py-1">
                               <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{k}</span>
                               <span className="text-[11px] text-white font-medium">{String(v)}</span>
                            </div>
                        ))}
                        {selectedReport.parsedData?.["Common Bond of Membership"] && (
                           <div className="flex flex-col gap-1 border-l-2 border-slate-500 pl-4 py-1">
                               <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Common Bond</span>
                               <span className="text-[11px] text-white font-medium">{selectedReport.parsedData["Common Bond of Membership"]}</span>
                           </div>
                        )}
                        <div className={`flex flex-col gap-1 border-l-2 ${selectedReport.status === 'Issued COC' ? 'border-blue-500' : 'border-green-500'} pl-4 py-1`}>
                           <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Overall Status</span>
                           <span className={`text-[11px] ${selectedReport.status === 'Issued COC' ? 'text-blue-400' : 'text-green-400'} font-bold uppercase`}>{selectedReport.parsedData?.["Status of Coopererative"] || selectedReport.status}</span>
                        </div>
                     </div>
                   </div>
                </div>

                {/* Full Audit Log / Raw Data Toggle (Optional) */}
                <div className="mt-8 pt-8 border-t border-[var(--border)] transition-colors">
                   <details className="group cursor-pointer">
                      <summary className="list-none flex items-center justify-between">
                         <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">View System Raw Attributes</span>
                         <Eye size={14} className="text-[var(--text-muted)] group-open:rotate-180 transition-transform" />
                      </summary>
                      <div className="mt-4 bg-[var(--bg)] p-6 rounded-2xl font-mono text-[10px] text-[var(--text-muted)] max-h-[300px] overflow-y-auto transition-colors">
                        <pre>{JSON.stringify(selectedReport.parsedData, null, 2)}</pre>
                      </div>
                   </details>
                </div>
              </div>

              <footer className="px-6 py-4 md:px-8 md:py-6 bg-[var(--bg)] border-t border-[var(--border)] flex flex-col md:flex-row justify-between items-center gap-6 transition-colors">
                 <div className="flex flex-wrap gap-4 md:gap-8 justify-center md:justify-start">
                    <div className="flex flex-col">
                       <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Ingestion Date</span>
                       <span className="text-[12px] font-bold text-[var(--text-main)] transition-colors">{new Date(selectedReport.createdAt).toLocaleString()}</span>
                    </div>
                    {selectedReport.uploadedBy && (
                      <div className="flex flex-col">
                         <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Uploaded By</span>
                         <span className="text-[12px] font-bold text-[var(--text-main)] transition-colors">
                           {typeof selectedReport.uploadedBy === 'object' ? selectedReport.uploadedBy.displayName : 'System Admin'}
                         </span>
                      </div>
                    )}
                    <div className="flex flex-col">
                       <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest">System Unique ID</span>
                       <span className="text-[10px] font-mono text-[var(--text-muted)] uppercase transition-colors">{selectedReport._id}</span>
                    </div>
                 </div>
                 <div className="flex flex-wrap gap-3 w-full md:w-auto justify-center">
                   <button 
                    onClick={() => generateEvaluationReport(selectedReport, user)}
                    className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-all flex items-center gap-2"
                    title="Generate Evaluation PDF"
                   >
                     <FileText size={18} />
                     Export PDF
                   </button>
                   <button 
                    onClick={() => {
                      const dataStr = JSON.stringify(selectedReport, null, 2);
                      navigator.clipboard.writeText(dataStr);
                      setUploadMessage({ type: 'success', text: 'Report data copied to clipboard' });
                    }}
                    className="p-2.5 text-[var(--text-muted)] hover:text-blue-600 dark:hover:text-blue-400 transition-colors border border-[var(--border)] rounded-xl bg-[var(--card)] flex-shrink-0"
                    title="Copy Raw Data"
                   >
                     <Copy size={18} />
                   </button>
                      <button 
                       onClick={handleUpdate}
                       disabled={isUpdating}
                       className={`px-8 py-3 rounded-2xl text-sm font-bold transition-all flex items-center gap-2.5 shadow-xl ${
                         isUpdating 
                         ? 'bg-[var(--bg)] text-[var(--text-muted)] cursor-not-allowed shadow-none' 
                         : isUpdated
                         ? 'bg-emerald-500 text-white shadow-emerald-200'
                         : 'bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95 shadow-indigo-200 hover:shadow-indigo-300'
                       }`}
                     >
                       {isUpdating ? (
                         <FuturisticLoader size={16} text="" />
                       ) : isUpdated ? (
                         <CheckCircle2 size={16} />
                       ) : (
                         <RefreshCw size={16} className="transition-transform" />
                       )}
                       {isUpdating ? 'Saving...' : isUpdated ? 'Updated' : 'Update Record'}
                     </button>
                     <button 
                     onClick={() => {
                       setSelectedReport(null);
                       setUploadMessage(null);
                     }}
                     className="bg-slate-900 dark:bg-blue-600 text-white px-6 py-2.5 rounded-xl font-bold text-sm shadow-xl shadow-slate-900/10 hover:bg-slate-800 dark:hover:bg-blue-700 transition-all border border-transparent dark:border-blue-500/20"
                    >
                      Close View
                    </button>
                 </div>
              </footer>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {historyTargetReport && (
          <div className="fixed inset-0 bg-[#0F172A]/80 z-[70] flex items-center justify-center p-4 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-[var(--card)] border border-[var(--border)] rounded-3xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col overflow-hidden transition-colors"
            >
              <header className="px-8 py-6 border-b border-[var(--border)] flex justify-between items-center bg-[var(--bg)] transition-colors">
                <div>
                  <h3 className="text-xl font-bold text-[var(--text-main)] transition-colors">Audit Trail</h3>
                  <p className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-widest mt-1 transition-colors">
                    {historyTargetReport.cooperativeName}
                  </p>
                </div>
                <button 
                  onClick={() => setHistoryTargetReport(null)}
                  className="w-10 h-10 rounded-full flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--bg)] hover:text-[var(--text-main)] transition-all"
                >
                  <X size={20} />
                </button>
              </header>

              <div className="flex-1 overflow-y-auto p-8 scrollbar-thin scrollbar-thumb-[var(--border)]">
                {historyLoading ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-4">
                    <FuturisticLoader size={60} text="RETRIEVING LOGS" />
                  </div>
                ) : reportHistory.length === 0 ? (
                  <div className="text-center py-20 text-[var(--text-muted)] italic text-sm transition-colors">
                    No history logs found for this report.
                  </div>
                ) : (
                  <div className="space-y-6">
                    {reportHistory.map((log, i) => (
                      <div key={log._id || `history-${i}`} className="relative pl-8 pb-1 border-l border-[var(--border)] last:border-0 transition-colors">
                        <div className="absolute left-[-5px] top-0 w-[9px] h-[9px] rounded-full bg-blue-600 shadow-[0_0_10px_rgba(37,99,235,0.5)]" />
                        <div className="bg-[var(--bg)] border border-[var(--border)] rounded-2xl p-5 shadow-sm hover:shadow-md transition-all">
                          <div className="flex justify-between items-start mb-3">
                            <span className="bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 text-[10px] font-black px-2.5 py-1 rounded-lg uppercase tracking-wider transition-colors">
                              {log.action.replace(/_/g, ' ')}
                            </span>
                            <span className="text-[10px] font-mono text-[var(--text-muted)] transition-colors">
                              {new Date(log.timestamp).toLocaleString()}
                            </span>
                          </div>
                          <p className="text-sm text-[var(--text-main)] font-medium leading-relaxed transition-colors">{log.details}</p>
                          <div className="mt-4 flex items-center gap-2 pt-4 border-t border-[var(--border)] transition-colors">
                            <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-[10px] font-bold text-white uppercase transition-colors">
                              {log.user?.displayName?.charAt(0) || 'U'}
                            </div>
                            <span className="text-[11px] font-bold text-[var(--text-muted)] transition-colors">
                              {log.user?.displayName || 'Unknown User'}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <footer className="px-8 py-6 bg-[var(--bg)] border-t border-[var(--border)] text-right transition-colors">
                <button 
                  onClick={() => setHistoryTargetReport(null)}
                  className="bg-slate-900 dark:bg-blue-600 text-white px-8 py-2.5 rounded-xl font-bold text-sm shadow-xl shadow-slate-900/10 hover:bg-slate-800 dark:hover:bg-blue-700 transition-all transition-colors"
                >
                  Close History
                </button>
              </footer>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showPasswordChange && (
          <div className="fixed inset-0 bg-[#0F172A]/90 z-[60] flex items-center justify-center p-4 backdrop-blur-md">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-2xl max-w-sm w-full p-10 transition-colors"
            >
              <div className="flex flex-col items-center text-center">
                 <div className="w-16 h-16 bg-blue-50 dark:bg-blue-900/30 rounded-full flex items-center justify-center text-blue-600 dark:text-blue-400 mb-6 transition-colors">
                    <ShieldAlert size={32} />
                 </div>
                 <h3 className="text-2xl font-bold mb-2 text-[var(--text-main)] transition-colors">Secure Your Account</h3>
                 <p className="text-[13px] text-[var(--text-muted)] leading-relaxed mb-8 transition-colors">
                   A password update is required for all new administrative accounts. Use at least 6 characters.
                 </p>
              </div>

              <form onSubmit={handlePasswordChange} className="space-y-4">
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] mt-0.5" size={16} />
                  <input 
                    type="password"
                    required
                    minLength={6}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl pl-10 pr-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all text-[var(--text-main)]"
                    placeholder="New Secure Password"
                  />
                </div>

                <button 
                  type="submit"
                  disabled={passLoading}
                  className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold text-sm hover:bg-blue-700 flex items-center justify-center gap-2 mt-4 shadow-lg shadow-blue-600/20 transition-all"
                >
                  {passLoading ? <FuturisticLoader size={18} text="" /> : 'Update & Enter System'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isAddingCoop && renderAddCoopModal()}
      </AnimatePresence>
    </div>
  );
}
