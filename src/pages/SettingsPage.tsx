/**
 * SettingsPage — User configuration, backup/restore manager, central material dictionary, and recycle bin.
 */

import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useUIStore } from '@/stores/uiStore';
import { useBorewellStore } from '@/stores/borewellStore';
import { 
  Settings, ArrowLeft, Sun, Moon, Database, Shield, Layers, Plus, Trash2, 
  RefreshCw, Upload, FolderHeart, ShieldAlert, Check
} from 'lucide-react';
import { AVAILABLE_PATTERNS } from '@/shared/constants';

export function SettingsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useUIStore((s) => s.theme);
  const toggleTheme = useUIStore((s) => s.toggleTheme);
  const addToast = useUIStore((s) => s.addToast);

  // Store lists & triggers
  const backups = useBorewellStore((s) => s.backups);
  const fetchBackupsList = useBorewellStore((s) => s.fetchBackupsList);
  const restoreBackup = useBorewellStore((s) => s.restoreBackup);
  const restoreBackupExternal = useBorewellStore((s) => s.restoreBackupExternal);

  const trash = useBorewellStore((s) => s.trash);
  const fetchTrash = useBorewellStore((s) => s.fetchTrash);
  const restoreBorewell = useBorewellStore((s) => s.restoreBorewell);
  const deleteBorewellPermanent = useBorewellStore((s) => s.deleteBorewellPermanent);

  const materials = useBorewellStore((s) => s.materials);
  const fetchMaterials = useBorewellStore((s) => s.fetchMaterials);
  const addMaterial = useBorewellStore((s) => s.addMaterial);
  const deleteMaterial = useBorewellStore((s) => s.deleteMaterial);

  // Tab State
  const [activeTab, setActiveTab] = useState<'general' | 'materials' | 'trash'>('general');

  useEffect(() => {
    if (location.state && (location.state as any).tab) {
      setActiveTab((location.state as any).tab);
    }
  }, [location.state]);

  // General Settings States
  const [dbPath, setDbPath] = useState('');
  const [backupPath, setBackupPath] = useState('');

  // Material Creation Form States
  const [newMatName, setNewMatName] = useState('');
  const [newMatColor, setNewMatColor] = useState('#E87B35');
  const [newMatPattern, setNewMatPattern] = useState('solid');

  // Loading States
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [restoring, setRestoring] = useState(false);

  // Last Backup status state
  const [lastBackupStatus, setLastBackupStatus] = useState<{
    lastBackupTime: string | null;
    status: 'success' | 'failed' | null;
    integrity: 'ok' | 'failed' | null;
  } | null>(null);

  // Permanent Delete Modal states
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteRecordId, setDeleteRecordId] = useState('');
  const [deleteBorewellId, setDeleteBorewellId] = useState('');
  const [deleteExpectedBorewellId, setDeleteExpectedBorewellId] = useState('');
  const [deleteRecordName, setDeleteRecordName] = useState('');

  const fetchBackupStatus = async () => {
    try {
      const status = await window.api.settings.getBackupStatus();
      setLastBackupStatus(status);
    } catch (err) {
      console.error('Failed to get last backup status:', err);
    }
  };

  // Load configuration from database/file storage
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await window.api.settings.get();
        if (settings) {
          setDbPath(settings.databasePath || '');
          setBackupPath(settings.backupPath || '');
        }
      } catch (err) {
        console.error('Failed to load settings:', err);
      }
    };
    loadSettings();
    fetchBackupsList();
    fetchTrash();
    fetchMaterials();
    fetchBackupStatus();
  }, [fetchBackupsList, fetchTrash, fetchMaterials]);

  // Backup & Restore
  const handleBackupNow = async () => {
    setLoadingBackups(true);
    try {
      const res = await window.api.settings.backupDatabase();
      if (res.success) {
        addToast({ message: 'Database integrity verified. Backup saved successfully!', type: 'success' });
        await fetchBackupsList();
        await fetchBackupStatus();
      } else {
        addToast({ message: `Backup failed: ${res.error || 'Unknown error'}`, type: 'error' });
      }
    } catch (err: any) {
      addToast({ message: `Backup failed: ${err.message || String(err)}`, type: 'error' });
    } finally {
      setLoadingBackups(false);
    }
  };

  const handleRestoreBackup = async (filename: string) => {
    if (!confirm(`WARNING: Are you sure you want to restore the database to "${filename}"? This will overwrite all active logs on screen. A backup of your current database will be saved before restoring.`)) {
      return;
    }
    setRestoring(true);
    try {
      const res = await restoreBackup(filename);
      if (res.success) {
        addToast({ message: 'Database restored successfully! Reloading data...', type: 'success' });
        await fetchTrash();
        await fetchMaterials();
        await fetchBackupStatus();
      } else {
        addToast({ message: `Restore failed: ${res.error || 'integrity violation'}`, type: 'error' });
      }
    } catch (err: any) {
      addToast({ message: `Restore failed: ${err.message || String(err)}`, type: 'error' });
    } finally {
      setRestoring(false);
    }
  };

  const handleRestoreExternal = async () => {
    try {
      const picker = await window.api.dialog.openFile({
        title: 'Select Backup Database to Restore',
        filters: [{ name: 'SQLite Database', extensions: ['db'] }]
      });

      if (picker.canceled || !picker.filePaths || picker.filePaths.length === 0) {
        return;
      }

      const filePath = picker.filePaths[0];
      if (!confirm(`WARNING: Are you sure you want to restore the database from the file "${filePath}"? All active records will be overwritten.`)) {
        return;
      }

      setRestoring(true);
      const res = await restoreBackupExternal(filePath);
      if (res.success) {
        addToast({ message: 'External database restored successfully!', type: 'success' });
        await fetchTrash();
        await fetchMaterials();
        await fetchBackupsList();
        await fetchBackupStatus();
      } else {
        addToast({ message: `Restore failed: ${res.error || 'invalid SQLite file'}`, type: 'error' });
      }
    } catch (err: any) {
      addToast({ message: `Restore failed: ${err.message || String(err)}`, type: 'error' });
    } finally {
      setRestoring(false);
    }
  };

  const handleChangeBackupPath = async () => {
    try {
      const res = await window.api.dialog.openDirectory({
        title: 'Select Backup Directory',
        defaultPath: backupPath || undefined,
      });

      if (!res.canceled && res.filePaths && res.filePaths.length > 0) {
        const newPath = res.filePaths[0];
        setBackupPath(newPath);
        await window.api.settings.save({ backupPath: newPath });
        addToast({ message: 'Backup directory updated successfully.', type: 'success' });
        await fetchBackupsList();
        await fetchBackupStatus();
      }
    } catch (err: any) {
      addToast({ message: `Failed to change directory: ${err.message || String(err)}`, type: 'error' });
    }
  };

  // Materials Dictionary Management
  const handleAddMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMatName.trim()) return;

    const nameClean = newMatName.trim();
    if (materials.some((m) => m.name.toLowerCase() === nameClean.toLowerCase())) {
      addToast({ message: `"${nameClean}" already exists in the dictionary.`, type: 'warning' });
      return;
    }

    const newMat = {
      id: nameClean.toLowerCase().replace(/\s+/g, '_'),
      name: nameClean,
      color: newMatColor,
      pattern: newMatPattern,
      isCustom: true,
      lithologyClass: 'OTHER' as const,
      lithologyFamily: 'OTHER' as const,
    };

    try {
      await addMaterial(newMat);
      addToast({ message: `Added "${nameClean}" to dictionary.`, type: 'success' });
      setNewMatName('');
    } catch (err: any) {
      addToast({ message: `Failed to add material: ${err.message || String(err)}`, type: 'error' });
    }
  };

  const handleDeleteMaterial = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}" from the dictionary?`)) {
      return;
    }
    try {
      await deleteMaterial(id);
      addToast({ message: `Deleted "${name}" from dictionary.`, type: 'info' });
    } catch (err: any) {
      addToast({ message: `Failed to delete material: ${err.message || String(err)}`, type: 'error' });
    }
  };

  // Recycle Bin / Trash Management
  const handleRestoreBorewell = async (id: string, name: string) => {
    try {
      await restoreBorewell(id);
      addToast({ message: `Restored "${name}" successfully!`, type: 'success' });
    } catch (err: any) {
      addToast({ message: `Failed to restore: ${err.message || String(err)}`, type: 'error' });
    }
  };

  const handlePermanentDelete = (id: string, name: string, expectedBorewellId: string) => {
    setDeleteRecordId(id);
    setDeleteRecordName(name);
    setDeleteExpectedBorewellId(expectedBorewellId);
    setDeleteBorewellId('');
    setDeleteConfirmOpen(true);
  };

  const handleConfirmPermanentDelete = async () => {
    if (deleteBorewellId !== deleteExpectedBorewellId) {
      addToast({ message: 'Borewell ID mismatch. Delete aborted.', type: 'warning' });
      return;
    }
    try {
      await deleteBorewellPermanent(deleteRecordId);
      addToast({ message: `Permanently deleted "${deleteRecordName}".`, type: 'info' });
      setDeleteConfirmOpen(false);
    } catch (err: any) {
      addToast({ message: `Failed to delete permanently: ${err.message || String(err)}`, type: 'error' });
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6 select-none relative">
      {restoring && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex flex-col items-center justify-center z-50 animate-fadeIn">
          <RefreshCw className="animate-spin text-accent mb-4" size={48} />
          <h2 className="text-lg font-bold text-txt-primary">Restoring Database...</h2>
          <p className="text-xs text-txt-muted mt-1">Please wait, reloading application state.</p>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/')}
          className="p-2 hover:bg-sf-surface-2 border border-sf-border text-txt-secondary hover:text-txt-primary rounded-lg transition-all cursor-pointer"
        >
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-txt-primary">Settings Center</h1>
          <p className="text-2xs text-txt-muted">Manage system configuration, central materials, automated backups, and trash bin.</p>
        </div>
      </div>

      {/* Tab Navigation Menu */}
      <div className="flex border-b border-sf-border gap-1 bg-sf-surface p-1 rounded-xl shadow-sf">
        <button
          onClick={() => setActiveTab('general')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
            activeTab === 'general' ? 'bg-accent text-white shadow-sf-glow' : 'text-txt-secondary hover:bg-sf-surface-2 hover:text-txt-primary'
          }`}
        >
          <Settings size={14} />
          <span>General & Backups</span>
        </button>

        <button
          onClick={() => setActiveTab('materials')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
            activeTab === 'materials' ? 'bg-accent text-white shadow-sf-glow' : 'text-txt-secondary hover:bg-sf-surface-2 hover:text-txt-primary'
          }`}
        >
          <Layers size={14} />
          <span>Material Dictionary</span>
        </button>

        <button
          onClick={() => setActiveTab('trash')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
            activeTab === 'trash' ? 'bg-accent text-white shadow-sf-glow' : 'text-txt-secondary hover:bg-sf-surface-2 hover:text-txt-primary'
          }`}
        >
          <Trash2 size={14} />
          <span>Recycle Bin ({trash.length})</span>
        </button>
      </div>

      {/* TAB CONTENTS */}
      <div className="grid grid-cols-1 gap-6">
        
        {/* Tab 1: General & Backups */}
        {activeTab === 'general' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-1 space-y-6">
              {/* App Theme */}
              <div className="sf-panel p-5 space-y-4 shadow-sf">
                <h2 className="text-sm font-bold text-txt-primary pb-2 border-b border-sf-border flex items-center gap-1.5">
                  <Settings size={16} className="text-accent" />
                  <span>General Preferences</span>
                </h2>
                <div className="flex justify-between items-center py-1 text-xs">
                  <div>
                    <span className="font-bold text-txt-primary block">App Theme Mode</span>
                    <span className="text-2xs text-txt-secondary">Light/dark screen styling</span>
                  </div>
                  <button
                    onClick={toggleTheme}
                    className="sf-btn-secondary flex items-center gap-1.5 px-3 py-1.5 text-2xs"
                  >
                    {theme === 'dark' ? <Moon size={12} /> : <Sun size={12} />}
                    <span>{theme === 'dark' ? 'Dark Mode' : 'Light Mode'}</span>
                  </button>
                </div>
              </div>

              {/* Data paths config */}
              <div className="sf-panel p-5 space-y-4 shadow-sf">
                <h2 className="text-sm font-bold text-txt-primary pb-2 border-b border-sf-border flex items-center gap-1.5">
                  <Database size={16} className="text-accent" />
                  <span>Storage Configuration</span>
                </h2>

                <div className="space-y-3 text-xs">
                  <div>
                    <label className="sf-label text-3xs font-semibold">Active Database Path</label>
                    <input
                      type="text"
                      readOnly
                      value={dbPath}
                      className="sf-input font-mono text-3xs bg-sf-surface-2 cursor-not-allowed mt-1"
                    />
                  </div>

                  <div>
                    <label className="sf-label text-3xs font-semibold">Automatic Backups Folder</label>
                    <div className="flex gap-2 mt-1">
                      <input
                        type="text"
                        readOnly
                        value={backupPath}
                        className="sf-input font-mono text-3xs bg-sf-surface-2 flex-1"
                      />
                      <button
                        onClick={handleChangeBackupPath}
                        className="sf-btn-secondary text-2xs px-2.5"
                      >
                        Change
                      </button>
                    </div>
                  </div>

                  {/* Last Backup Integrity Report */}
                  <div className="p-3 bg-sf-void border border-sf-border rounded-lg space-y-2 select-none text-[11px] font-mono">
                    <div className="text-[9px] uppercase text-txt-muted font-bold tracking-wider">Last Automated Backup Report</div>
                    {lastBackupStatus && lastBackupStatus.lastBackupTime ? (
                      <div className="space-y-1">
                        <div className="flex justify-between">
                          <span className="text-txt-secondary">Time:</span>
                          <span className="text-txt-primary font-bold">{new Date(lastBackupStatus.lastBackupTime).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-txt-secondary">Status:</span>
                          <span className={lastBackupStatus.status === 'success' ? 'text-success font-bold' : 'text-danger font-bold'}>
                            {lastBackupStatus.status?.toUpperCase()}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-txt-secondary">Integrity check:</span>
                          <span className={lastBackupStatus.integrity === 'ok' ? 'text-success font-bold' : 'text-danger font-bold'}>
                            {lastBackupStatus.integrity === 'ok' ? 'PASSED (ok)' : 'FAILED'}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-txt-muted text-2xs py-1">No backups recorded yet. Run a backup now.</div>
                    )}
                  </div>

                  <div className="pt-2 border-t border-sf-border">
                    <button
                      onClick={handleBackupNow}
                      disabled={loadingBackups}
                      className="w-full sf-btn-primary flex items-center justify-center gap-2 py-2 cursor-pointer"
                    >
                      <Shield size={14} />
                      <span>{loadingBackups ? 'Verifying & Saving...' : 'Verify & Backup DB'}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Backups List Table */}
            <div className="md:col-span-2 sf-panel p-5 space-y-4 shadow-sf">
              <div className="flex justify-between items-center pb-2 border-b border-sf-border">
                <h2 className="text-sm font-bold text-txt-primary flex items-center gap-1.5">
                  <Database size={16} className="text-accent" />
                  <span>Automated Database Backups (30 Archive Limit)</span>
                </h2>
                <button
                  onClick={handleRestoreExternal}
                  className="sf-btn-secondary text-2xs py-1 px-3 flex items-center gap-1.5"
                >
                  <Upload size={12} />
                  <span>Restore from File...</span>
                </button>
              </div>

              {backups.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-sf-border rounded-xl text-txt-muted text-xs flex flex-col gap-2 justify-center items-center">
                  <ShieldAlert size={24} className="text-txt-muted" />
                  <span>No database backup archives found on disk.</span>
                  <button onClick={handleBackupNow} className="text-xs text-accent hover:underline font-semibold mt-1">
                    Create your first verified backup now
                  </button>
                </div>
              ) : (
                <div className="sf-table-container">
                  <table className="sf-table sf-table-striped">
                    <thead>
                      <tr>
                        <th>Backup Filename</th>
                        <th>Archive Date</th>
                        <th>File Size</th>
                        <th>Status</th>
                        <th className="text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {backups.map((bk) => (
                        <tr key={bk.name} className="hover:bg-sf-surface-2/40">
                          <td className="py-2.5 font-mono text-3xs text-txt-primary">{bk.name}</td>
                          <td className="text-txt-secondary">{new Date(bk.time).toLocaleString()}</td>
                          <td className="text-txt-secondary font-mono text-3xs">{(bk.size / 1024).toFixed(1)} KB</td>
                          <td>
                            <span className="flex items-center gap-1 text-success text-3xs font-semibold bg-success/10 px-2 py-0.5 rounded-full w-max">
                              <Check size={10} /> Checked
                            </span>
                          </td>
                          <td className="text-right">
                            <button
                              onClick={() => handleRestoreBackup(bk.name)}
                              className="sf-btn-secondary text-2xs py-0.5 px-2 hover:bg-accent/10 hover:text-accent"
                            >
                              Restore
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Material Dictionary Manager */}
        {activeTab === 'materials' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Add New Material Form */}
            <div className="md:col-span-1 sf-panel p-5 space-y-4 shadow-sf h-fit">
              <h2 className="text-sm font-bold text-txt-primary pb-2 border-b border-sf-border flex items-center gap-1.5">
                <Plus size={16} className="text-accent" />
                <span>Add Dictionary Material</span>
              </h2>

              <form onSubmit={handleAddMaterial} className="space-y-4 text-xs">
                <div>
                  <label className="sf-label">Material Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Silty Sand"
                    value={newMatName}
                    onChange={(e) => setNewMatName(e.target.value)}
                    className="sf-input mt-1"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="sf-label">Fill Pattern</label>
                    <select
                      value={newMatPattern}
                      onChange={(e) => setNewMatPattern(e.target.value)}
                      className="sf-input mt-1"
                    >
                      {AVAILABLE_PATTERNS.map(pat => (
                        <option key={pat} value={pat}>{pat.charAt(0).toUpperCase() + pat.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="sf-label">Color Swatch</label>
                    <div className="flex items-center gap-2 mt-1">
                      <input
                        type="color"
                        value={newMatColor}
                        onChange={(e) => setNewMatColor(e.target.value)}
                        className="w-10 h-10 rounded border border-sf-border cursor-pointer bg-transparent"
                      />
                      <input
                        type="text"
                        value={newMatColor.toUpperCase()}
                        onChange={(e) => setNewMatColor(e.target.value)}
                        className="sf-input font-mono text-3xs py-2 w-full text-center"
                      />
                    </div>
                  </div>
                </div>

                <button type="submit" className="w-full sf-btn-primary py-2 flex items-center justify-center gap-1.5 mt-2">
                  <Plus size={14} />
                  <span>Save Material</span>
                </button>
              </form>
            </div>

            {/* Central Dictionary list */}
            <div className="md:col-span-2 sf-panel p-5 space-y-4 shadow-sf">
              <h2 className="text-sm font-bold text-txt-primary pb-2 border-b border-sf-border flex items-center gap-1.5">
                <Layers size={16} className="text-accent" />
                <span>Geological Material Dictionary Vocabulary ({materials.length})</span>
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[480px] overflow-y-auto pr-1">
                {materials.map((mat) => (
                  <div
                    key={mat.id}
                    className="flex justify-between items-center p-3 rounded-xl bg-sf-surface-2 border border-sf-border hover:border-sf-border-hover transition-all text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-lg border border-white/20 flex items-center justify-center shadow-inner relative overflow-hidden"
                        style={{ backgroundColor: mat.color }}
                      >
                        {mat.pattern !== 'solid' && (
                          <div className="absolute inset-0 opacity-20 pointer-events-none" style={{
                            backgroundImage: mat.pattern === 'dots' 
                              ? 'radial-gradient(#000 15%, transparent 16%)'
                              : mat.pattern === 'lines'
                              ? 'linear-gradient(90deg, #000 1px, transparent 0)'
                              : mat.pattern === 'diagonal'
                              ? 'linear-gradient(45deg, #000 25%, transparent 25%, transparent 50%, #000 50%, #000 75%, transparent 75%, transparent)'
                              : mat.pattern === 'bricks'
                              ? 'repeating-linear-gradient(0deg, #000 0, #000 1px, transparent 0, transparent 8px)'
                              : 'none',
                            backgroundSize: '8px 8px'
                          }} />
                        )}
                      </div>
                      <div>
                        <span className="font-bold text-txt-primary block leading-tight">{mat.name}</span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-3xs text-txt-muted uppercase font-mono">{mat.pattern}</span>
                          <span className="text-3xs text-txt-muted font-semibold">•</span>
                          <span className={`text-4xs font-bold px-1.5 py-0.5 rounded-full ${mat.isCustom ? 'bg-accent/10 text-accent' : 'bg-sf-surface-3 text-txt-secondary'}`}>
                            {mat.isCustom ? 'Custom' : 'System'}
                          </span>
                        </div>
                      </div>
                    </div>
                    {mat.isCustom && (
                      <button
                        onClick={() => handleDeleteMaterial(mat.id, mat.name)}
                        className="p-2 hover:bg-danger/10 text-txt-muted hover:text-danger rounded-lg transition-all"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Recycle Bin */}
        {activeTab === 'trash' && (
          <div className="sf-panel p-5 space-y-4 shadow-sf">
            <h2 className="text-sm font-bold text-txt-primary pb-2 border-b border-sf-border flex items-center gap-1.5">
              <Trash2 size={16} className="text-warning" />
              <span>Borewell Recycle Bin (Soft-deleted logs)</span>
            </h2>

            {trash.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-sf-border rounded-xl text-txt-muted text-xs flex flex-col gap-2 justify-center items-center">
                <FolderHeart size={28} className="text-txt-muted animate-pulse" />
                <span>The Recycle Bin is completely empty.</span>
                <p className="text-2xs text-txt-secondary leading-relaxed max-w-sm mt-0.5">
                  When you delete borewell logs, they are moved here. You can safely restore them or wipe them forever.
                </p>
              </div>
            ) : (
              <div className="sf-table-container">
                <table className="sf-table sf-table-striped">
                  <thead>
                    <tr>
                      <th>Borewell Name</th>
                      <th>Record ID</th>
                      <th>Project</th>
                      <th>City/District</th>
                      <th>Deleted Date</th>
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trash.map((b) => (
                      <tr key={b.id} className="hover:bg-sf-surface-2/40">
                        <td className="py-3 font-semibold text-txt-primary">{b.ownerName}</td>
                        <td><span className="sf-badge-accent py-0.5 px-2 text-2xs">{b.borewellId}</span></td>
                        <td className="text-txt-secondary">{b.project}</td>
                        <td className="text-txt-secondary">{b.city}</td>
                        <td className="text-txt-secondary">{b.deletedAt ? new Date(b.deletedAt).toLocaleString() : 'N/A'}</td>
                        <td className="text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => handleRestoreBorewell(b.id, b.ownerName)}
                              className="sf-btn-secondary text-2xs py-1 px-3 hover:bg-success/15 hover:text-success hover:border-success/30"
                            >
                              Restore
                            </button>
                             <button
                              onClick={() => handlePermanentDelete(b.id, b.ownerName, b.borewellId)}
                              className="sf-btn-secondary text-2xs py-1 px-3 text-danger border-danger/20 hover:bg-danger/10 hover:border-danger/40 cursor-pointer"
                            >
                              Destroy Permanently
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {deleteConfirmOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 animate-fade-in p-4 select-text">
          <div className="bg-sf-surface border border-sf-border rounded-xl p-6 max-w-md w-full shadow-lg space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-danger/10 text-danger rounded-lg flex-shrink-0">
                <ShieldAlert size={20} />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-txt-primary">Confirm Permanent Deletion</h3>
                <p className="text-2xs text-txt-secondary leading-relaxed">
                  Are you sure you want to permanently delete <strong className="text-txt-primary">"{deleteRecordName}"</strong>? This will wipe this borewell and all associated strata, pipes, and photos from the database. This action CANNOT be undone.
                </p>
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-sf-border text-xs">
              <label className="sf-label block text-txt-secondary">
                To confirm, type the exact Borewell ID <strong className="text-txt-primary font-mono select-all">"{deleteExpectedBorewellId}"</strong> below:
              </label>
              <input
                type="text"
                className="sf-input w-full font-mono mt-1 text-txt-primary"
                placeholder={deleteExpectedBorewellId}
                value={deleteBorewellId}
                onChange={(e) => setDeleteBorewellId(e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setDeleteConfirmOpen(false)}
                className="sf-btn-secondary py-1.5 px-4 text-2xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmPermanentDelete}
                disabled={deleteBorewellId !== deleteExpectedBorewellId}
                className="sf-btn-danger py-1.5 px-4 text-2xs disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer font-bold"
              >
                Permanently Destroy
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
export default SettingsPage;
