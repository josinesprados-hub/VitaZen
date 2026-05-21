'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NumericInput } from '@/components/ui/NumericInput';
import { Label } from '@/components/ui/label';
import {
  User,
  MapPin,
  Calendar,
  Mail,
  Circle,
  Camera,
  Save,
  Check,
  Loader2,
  Pencil,
} from 'lucide-react';

export default function PerfilPage() {
  const { user, firebaseUser, refreshUser } = useAuth();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      timersRef.current.forEach(t => clearTimeout(t));
    };
  }, []);

  const [form, setForm] = useState({
    name: '',
    avatarUrl: '',
    country: '',
    city: '',
    age: '',
    bio: '',
  });

  // Sync form with user data
  useEffect(() => {
    if (user) {
      setForm({
        name: user.name || '',
        avatarUrl: user.avatarUrl || '',
        country: user.country || '',
        city: user.city || '',
        age: user.age?.toString() || '',
        bio: user.bio || '',
      });
    }
  }, [user]);

  // Auto-dismiss errors after 3s
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 3000);
    return () => clearTimeout(timer);
  }, [error]);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // For now, use a data URL approach (simple, no external storage needed)
    // In production, you'd upload to S3/Cloudinary
    if (file.size > 2 * 1024 * 1024) {
      setError('La imagen es demasiado grande (max 2MB)');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string;
      setForm(prev => ({ ...prev, avatarUrl: dataUrl }));
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!firebaseUser) return;

    setSaving(true);
    setError(null);

    try {
      const idToken = await firebaseUser.getIdToken();
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          name: form.name || null,
          avatarUrl: form.avatarUrl || null,
          country: form.country || null,
          city: form.city || null,
          age: form.age ? parseInt(form.age, 10) : null,
          bio: form.bio || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Error al guardar');
      }

      // Refresh user data in auth context
      await refreshUser();
      setEditing(false);
      setSaved(true);
      timersRef.current.push(setTimeout(() => setSaved(false), 2500));
    } catch (err: any) {
      setError(err.message || 'Error al guardar el perfil');
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const planLabel = user?.plan === 'PREMIUM' ? 'Élite' : 'Free';
  const isPremium = user?.plan === 'PREMIUM';

  return (
    <div className="max-w-2xl mx-auto space-y-6 page-transition">
      {/* Loading guard — user data must be available */}
      {!user ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-[#c8a55a] gentle-pulse" />
            <p className="text-[#c8a55a]/60 text-xs tracking-widest uppercase font-medium">Preparando tu perfil</p>
          </div>
        </div>
      ) : (
      <>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">Mi Perfil</h1>
          <p className="subtitle-silent mt-1">Tu espacio, tu ritmo</p>
        </div>
        {!editing ? (
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-[#c8a55a] bg-[#c8a55a]/10 border border-[#c8a55a]/20 rounded-lg hover:bg-[#c8a55a]/20 transition-colors touch-press"
          >
            <Pencil size={16} />
            Editar
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setEditing(false);
                setError(null);
                // Reset form to current user data
                if (user) {
                  setForm({
                    name: user.name || '',
                    avatarUrl: user.avatarUrl || '',
                    country: user.country || '',
                    city: user.city || '',
                    age: user.age?.toString() || '',
                    bio: user.bio || '',
                  });
                }
              }}
              className="px-4 py-2.5 text-sm text-[#999] hover:text-white transition-colors touch-press"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-primary flex items-center gap-2 touch-press"
            >
              {saving ? (
                <Loader2 size={16} className="animate-spin" />
              ) : saved ? (
                <Check size={16} />
              ) : (
                <Save size={16} />
              )}
              {saving ? 'Guardando...' : saved ? 'Guardado' : 'Guardar'}
            </button>
          </div>
        )}
      </div>

      {/* Avatar + Name Card */}
      <div className="card-primary p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row items-center gap-6">
          {/* Avatar */}
          <div className="relative group">
            <div className="w-24 h-24 rounded-full overflow-hidden bg-[#c8a55a]/10 border-2 border-[#1a1a1a] flex items-center justify-center">
              {form.avatarUrl ? (
                <img
                  src={form.avatarUrl}
                  alt="Avatar"
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-3xl font-bold text-[#c8a55a]">
                  {user?.name?.charAt(0)?.toUpperCase() || 'V'}
                </span>
              )}
            </div>
            {editing && (
              <>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className={`absolute inset-0 w-24 h-24 rounded-full bg-black/60 flex items-center justify-center transition-opacity touch-press ${editing ? 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                >
                  <Camera size={20} className="text-white" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarChange}
                  className="hidden"
                />
              </>
            )}
          </div>

          {/* Name + Plan */}
          <div className="text-center sm:text-left flex-1">
            {editing ? (
              <div className="space-y-3">
                <div>
                  <Label htmlFor="name" className="text-[#999] text-xs mb-1.5">Nombre</Label>
                  <Input
                    id="name"
                    value={form.name}
                    onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Tu nombre"
                    maxLength={100}
                    className="bg-[#000000] border-[#1a1a1a] text-white placeholder:text-[#555] focus:border-[#c8a55a] h-11"
                  />
                </div>
              </div>
            ) : (
              <>
                <h2 className="text-lg font-semibold text-white">{user?.name || 'Sin nombre'}</h2>
                <div className="flex items-center justify-center sm:justify-start gap-2 mt-2">
                  {user?.plan === 'PREMIUM' ? (
                    <span className="inline-flex items-center gap-1 text-[9px] font-medium text-[#c8a55a]/50">
                      <Circle size={3} fill="currentColor" className="text-[#c8a55a]/40" />
                      Élite
                    </span>
                  ) : (
                    <span className="text-[9px] font-medium text-[#555]">Free</span>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Profile Fields */}
      <div className="card-primary p-6 sm:p-8 space-y-5">
        <h3 className="text-sm font-semibold text-[#c8a55a] uppercase tracking-widest">Información personal</h3>

        {/* Location fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-[#999] text-xs mb-1.5 flex items-center gap-1.5">
              <MapPin size={12} />
              País
            </Label>
            {editing ? (
              <Input
                value={form.country}
                onChange={(e) => setForm(prev => ({ ...prev, country: e.target.value }))}
                placeholder="Ej: España"
                maxLength={80}
                className="bg-[#000000] border-[#1a1a1a] text-white placeholder:text-[#555] focus:border-[#c8a55a] h-11"
              />
            ) : (
              <p className="text-white text-sm mt-1">{user?.country || '—'}</p>
            )}
          </div>
          <div>
            <Label className="text-[#999] text-xs mb-1.5 flex items-center gap-1.5">
              <MapPin size={12} />
              Ciudad
            </Label>
            {editing ? (
              <Input
                value={form.city}
                onChange={(e) => setForm(prev => ({ ...prev, city: e.target.value }))}
                placeholder="Ej: Madrid"
                maxLength={80}
                className="bg-[#000000] border-[#1a1a1a] text-white placeholder:text-[#555] focus:border-[#c8a55a] h-11"
              />
            ) : (
              <p className="text-white text-sm mt-1">{user?.city || '—'}</p>
            )}
          </div>
        </div>

        {/* Age */}
        <div>
          <Label className="text-[#999] text-xs mb-1.5 flex items-center gap-1.5">
            <Calendar size={12} />
            Edad <span className="text-[#555]">(opcional)</span>
          </Label>
          {editing ? (
            <NumericInput
              value={form.age ? parseInt(form.age, 10) : 0}
              onChange={(v) => setForm(prev => ({ ...prev, age: v > 0 ? String(v) : '' }))}
              placeholder="Ej: 28"
              inputMode="numeric"
              allowDecimal={false}
              min={1}
              max={150}
              className="bg-[#000000] border-[#1a1a1a] text-white placeholder:text-[#555] focus:border-[#c8a55a] h-11 w-32 rounded-md border px-3 py-2 text-sm"
            />
          ) : (
            <p className="text-white text-sm mt-1">{user?.age ? `${user.age} años` : '—'}</p>
          )}
        </div>

        {/* Bio */}
        <div>
          <Label className="text-[#999] text-xs mb-1.5">Bio <span className="text-[#555]">(opcional)</span></Label>
          {editing ? (
            <>
              <Textarea
                value={form.bio}
                onChange={(e) => setForm(prev => ({ ...prev, bio: e.target.value }))}
                placeholder="Cuéntanos algo sobre ti..."
                maxLength={300}
                rows={3}
                className="bg-[#000000] border-[#1a1a1a] text-white placeholder:text-[#555] focus:border-[#c8a55a] resize-none"
              />
              <p className="text-[#555] text-xs mt-1">{form.bio.length}/300</p>
            </>
          ) : (
            <p className="text-white text-sm mt-1">{user?.bio || '—'}</p>
          )}
        </div>
      </div>

      {/* Account Info (read-only) */}
      <div className="card-primary p-6 sm:p-8 space-y-4">
        <h3 className="text-sm font-semibold text-[#c8a55a] uppercase tracking-widest">Cuenta</h3>

        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="icon-sm">
              <Mail size={14} className="text-[#c8a55a]" />
            </div>
            <div>
              <p className="text-[#999] text-xs">Email</p>
              <p className="text-white text-sm">{user?.email || '—'}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="icon-sm">
              {isPremium ? (
                <Circle size={5} fill="currentColor" className="text-[#c8a55a]/50" />
              ) : (
                <User size={14} className="text-[#c8a55a]" />
              )}
            </div>
            <div>
              <p className="text-[#999] text-xs">Plan actual</p>
              <div className="flex items-center gap-2">
                <p className="text-white text-sm">{planLabel}</p>
                {user?.plan === 'PREMIUM' && (
                  <span className="text-[8px] font-medium text-[#c8a55a]/40">Activo</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="icon-sm">
              <Calendar size={14} className="text-[#c8a55a]" />
            </div>
            <div>
              <p className="text-[#999] text-xs">Miembro desde</p>
              <p className="text-white text-sm">{formatDate(user?.createdAt)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="card-accent p-4 flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
          <p className="text-sm text-red-400">{error}</p>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-[#999] hover:text-white text-xs"
          >
            Cerrar
          </button>
        </div>
      )}
      </>
      )}
    </div>
  );
}
