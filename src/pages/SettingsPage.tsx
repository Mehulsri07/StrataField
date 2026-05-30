/**
 * SettingsPage — User configuration screen.
 * Persists theme preference, data locations, and custom geological materials library.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUIStore } from '@/stores/uiStore';
import { Settings, ArrowLeft, Sun, Moon, Database, Shield, Layers, Plus, Trash2 } from 'lucide-react';

export function SettingsPage() {
  const navigate = useNavigate();
  const theme = useUIStore((s) => s.theme);
  const toggleTheme = useUIStore((s) => s.toggleTheme);
  const addToast = useUIStore((s) => s.addToast);

  const [dbPath, setDbPath] = useState('');
  const [backupPath, setBackupPath] = useState('');
  const [customMaterials, setCustomMaterials] = useState<any[]>([]);

  const [newMatName, setNewMatName] = useState('');
  const [newMatColor, setNewMatColor] = useState('#E87B35');
  const [newMatPattern, setNewMatPattern] = useState('solid');

  // Load configuration from database/file storage
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await window.api.settings.get();
        if (settings) {
          setDbPath(settings.databasePath || '');
          setBackupPath(settings.backupPath || '');
          if (settings.customMaterials) {
            setCustomMaterials(settings.customMaterials);
          }
        }
      } catch (err) {
        console.error('Failed to load settings:', err);
      }
    };
    loadSettings();
  }, []);

  const handleAddMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMatName.trim()) return;

    if (customMaterials.some((m) => m.name.toLowerCase() === newMatName.toLowerCase())) {
      addToast({ message: 'A material with this name already exists.', type: 'warning' });
      return;
    }

    const updated = [
      ...customMaterials,
      { name: newMatName.trim(), color: newMatColor, pattern: newMatPattern, isCustom: true },
    ];
    setCustomMaterials(updated);
    setNewMatName('');
    
    try {
      await window.api.settings.save({ customMaterials: updated });
      addToast({ message: `Added custom material: ${newMatName}`, type: 'success' });
    } catch (err) {
      console.error(err);
      addToast({ message: 'Failed to persist material.', type: 'error' });
    }
  };

  const handleDeleteMaterial = async (name: string) => {
    const updated = customMaterials.filter((m) => m.name !== name);
    setCustomMaterials(updated);
    try {
      await window.api.settings.save({ customMaterials: updated });
      addToast({ message: `Deleted custom material: ${name}`, type: 'info' });
    } catch (err) {
      console.error(err);
      addToast({ message: 'Failed to persist change.', type: 'error' });
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
      }
    } catch (err: any) {
      addToast({ message: `Failed to change directory: ${err.message || String(err)}`, type: 'error' });
    }
  };

  const handleBackupNow = async () => {
    try {
      const res = await window.api.settings.backupDatabase();
      if (res.success) {
        addToast({ message: 'Manual database backup completed successfully!', type: 'success' });
      } else {
        addToast({ message: `Backup failed: ${res.error || 'Unknown error'}`, type: 'error' });
      }
    } catch (err: any) {
      addToast({ message: `Backup failed: ${err.message || String(err)}`, type: 'error' });
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6 select-none">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/')}
          className="p-2 hover:bg-sf-surface-2 border border-sf-border text-txt-secondary hover:text-txt-primary rounded-lg transition-all cursor-pointer"
        >
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-txt-primary">Settings</h1>
          <p className="text-2xs text-txt-muted">Manage system configuration, theme modes, paths, and custom materials library.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left Column */}
        <div className="space-y-6">
          {/* General & Theme Settings */}
          <div className="sf-panel p-5 space-y-4 shadow-sf">
            <h2 className="text-sm font-bold text-txt-primary pb-2 border-b border-sf-border flex items-center gap-1.5">
              <Settings size={16} className="text-accent" />
              <span>General Settings</span>
            </h2>

            <div className="flex justify-between items-center py-2 text-xs">
              <div>
                <span className="font-bold text-txt-primary block">App Theme Mode</span>
                <span className="text-2xs text-txt-secondary">Switch between dark and light displays</span>
              </div>
              <button
                onClick={toggleTheme}
                className="sf-btn-secondary flex items-center gap-1.5 px-3 py-1.5 text-xs"
              >
                {theme === 'dark' ? <Moon size={14} /> : <Sun size={14} />}
                <span>{theme === 'dark' ? 'Dark Mode' : 'Light Mode'}</span>
              </button>
            </div>
          </div>

          {/* Database & Backup Settings */}
          <div className="sf-panel p-5 space-y-4 shadow-sf">
            <h2 className="text-sm font-bold text-txt-primary pb-2 border-b border-sf-border flex items-center gap-1.5">
              <Database size={16} className="text-accent" />
              <span>Storage Locations</span>
            </h2>

            <div className="space-y-3">
              <div>
                <label className="sf-label text-2xs">Active SQLite Database Path</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={dbPath}
                    className="sf-input font-mono text-2xs flex-1 bg-sf-surface-2 cursor-not-allowed"
                  />
                  <button
                    onClick={() => addToast({ message: 'In V1, database path modifications are disabled.', type: 'info' })}
                    className="sf-btn-secondary text-2xs py-1 px-3 cursor-not-allowed"
                  >
                    Change
                  </button>
                </div>
              </div>

              <div>
                <label className="sf-label text-2xs">Automatic Backup Directory</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={backupPath}
                    className="sf-input font-mono text-2xs flex-1 bg-sf-surface-2 cursor-not-allowed"
                  />
                  <button
                    onClick={handleChangeBackupPath}
                    className="sf-btn-secondary text-2xs py-1 px-3"
                  >
                    Change
                  </button>
                </div>
              </div>

              <div className="pt-2 border-t border-sf-border">
                <button
                  type="button"
                  onClick={handleBackupNow}
                  className="w-full sf-btn-primary flex items-center justify-center gap-2 py-2"
                >
                  <Shield size={14} />
                  <span>Backup Database Now</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Custom Materials Management */}
        <div className="space-y-6">
          <div className="sf-panel p-5 space-y-4 shadow-sf">
            <h2 className="text-sm font-bold text-txt-primary pb-2 border-b border-sf-border flex items-center gap-1.5">
              <Layers size={16} className="text-accent" />
              <span>Custom Material Library</span>
            </h2>

            {/* Existing custom list */}
            <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
              {customMaterials.length === 0 ? (
                <div className="text-center py-6 border border-dashed border-sf-border rounded text-2xs text-txt-muted">
                  No custom geological materials added.
                </div>
              ) : (
                customMaterials.map((mat) => (
                  <div
                    key={mat.name}
                    className="flex justify-between items-center p-2 rounded-lg bg-sf-base border border-sf-border text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="w-4 h-4 rounded border border-white/20"
                        style={{ backgroundColor: mat.color }}
                      />
                      <div>
                        <span className="font-semibold text-txt-primary block leading-tight">{mat.name}</span>
                        <span className="text-3xs text-txt-muted uppercase tracking-wider font-mono">{mat.pattern}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteMaterial(mat.name)}
                      className="p-1 hover:bg-danger/10 text-txt-muted hover:text-danger rounded transition-all"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Add Custom form */}
            <form onSubmit={handleAddMaterial} className="border-t border-sf-border pt-4 space-y-3">
              <h3 className="text-2xs font-bold text-txt-primary uppercase tracking-wider">Add Custom Material</h3>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="sf-label text-3xs">Material Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Clay Loam"
                    value={newMatName}
                    onChange={(e) => setNewMatName(e.target.value)}
                    className="sf-input py-1 text-2xs"
                  />
                </div>

                <div>
                  <label className="sf-label text-3xs">Display Pattern</label>
                  <select
                    value={newMatPattern}
                    onChange={(e) => setNewMatPattern(e.target.value)}
                    className="sf-input py-1 text-2xs"
                  >
                    <option value="solid">Solid Color</option>
                    <option value="dots">Dotted</option>
                    <option value="diagonal">Diagonal Lines</option>
                    <option value="crosses">Crosshatch</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 pt-1">
                <div className="flex items-center gap-2">
                  <span className="text-3xs text-txt-secondary font-medium">Color Swatch:</span>
                  <input
                    type="color"
                    value={newMatColor}
                    onChange={(e) => setNewMatColor(e.target.value)}
                    className="w-7 h-7 rounded border border-sf-border cursor-pointer bg-transparent"
                  />
                </div>

                <button type="submit" className="sf-btn-primary py-1 px-3 text-2xs">
                  <Plus size={12} />
                  <span>Add Material</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
export default SettingsPage;
