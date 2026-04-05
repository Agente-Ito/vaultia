'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { useI18n } from '@/context/I18nContext';
import { useWeb3 } from '@/context/Web3Context';
import { getMerchantRegistryContract } from '@/lib/web3/contracts';

const REGISTRY_ADDRESS = process.env.NEXT_PUBLIC_MERCHANT_REGISTRY_ADDRESS ?? '';

export function MerchantRegistrationCard() {
  const { t } = useI18n();
  const { signer, account, isConnected } = useWeb3();

  const [name, setName] = useState('');
  const [registeredName, setRegisteredName] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkRegistration = useCallback(async () => {
    if (!account || !REGISTRY_ADDRESS) return;
    setChecking(true);
    try {
      const provider = signer?.provider;
      if (!provider) return;
      const reg = getMerchantRegistryContract(REGISTRY_ADDRESS, provider);
      const currentName = await reg.getName(account) as string;
      setRegisteredName(currentName || null);
    } catch {
      setRegisteredName(null);
    } finally {
      setChecking(false);
    }
  }, [account, signer]);

  useEffect(() => {
    void checkRegistration();
  }, [checkRegistration]);

  const handleRegister = async () => {
    if (!signer || !account || !name.trim()) return;
    setRegistering(true);
    setError(null);
    setSuccess(false);
    try {
      const reg = getMerchantRegistryContract(REGISTRY_ADDRESS, signer);
      const tx = await reg.register(name.trim());
      await tx.wait();
      setRegisteredName(name.trim());
      setSuccess(true);
      setName('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRegistering(false);
    }
  };

  if (!REGISTRY_ADDRESS) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('merchant_registry.title')}</CardTitle>
        <CardDescription>{t('merchant_registry.desc')}</CardDescription>
      </CardHeader>
      <CardContent>
        {!isConnected ? (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{t('merchant_registry.connect_prompt')}</p>
        ) : checking ? (
          <p className="text-sm animate-pulse" style={{ color: 'var(--text-muted)' }}>{t('merchant_registry.checking')}</p>
        ) : registeredName ? (
          <div className="space-y-3">
            <div className="rounded-xl px-4 py-3" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)' }}>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('merchant_registry.registered_note')}</p>
              <p className="text-sm font-semibold mt-0.5" style={{ color: 'var(--success)' }}>{registeredName}</p>
            </div>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('merchant_registry.update_note')}</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('merchant_registry.name_placeholder')}
                className="flex-1 rounded-xl px-3 py-2 text-sm focus:outline-none"
                style={{ background: 'var(--card-mid)', border: '1px solid var(--border)', color: 'var(--text)' }}
              />
              <Button size="sm" disabled={!name.trim() || registering} onClick={handleRegister}>
                {registering ? t('merchant_registry.btn_updating') : t('merchant_registry.btn_update')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                {t('merchant_registry.name_label')}
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('merchant_registry.name_placeholder')}
                className="w-full rounded-xl px-3 py-2 text-sm focus:outline-none"
                style={{ background: 'var(--card-mid)', border: '1px solid var(--border)', color: 'var(--text)' }}
              />
            </div>
            <Button size="sm" disabled={!name.trim() || registering} onClick={handleRegister} className="w-full">
              {registering ? t('merchant_registry.btn_registering') : t('merchant_registry.btn_register')}
            </Button>
          </div>
        )}
        {success && (
          <p className="text-sm mt-2" style={{ color: 'var(--success)' }}>{t('merchant_registry.success')}</p>
        )}
        {error && (
          <p className="text-sm mt-2 break-words" style={{ color: 'var(--blocked)' }}>{error}</p>
        )}
      </CardContent>
    </Card>
  );
}
