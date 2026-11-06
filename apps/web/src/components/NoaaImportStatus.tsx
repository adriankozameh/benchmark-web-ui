import { useEffect, useRef, useState } from 'react';
import { Info, LoaderCircle } from 'lucide-react';
import { BenchmarkApiError } from '@benchmark/api';
import type { BenchmarkApi } from '@benchmark/api';
import type { DisplayUnits, NoaaObservationStatus, UserLanguage } from '@benchmark/domain';
import { t } from '../language';

const POLL_DELAY: Partial<Record<NoaaObservationStatus['state'], number>> = {
    PENDING: 15_000,
    SEARCHING: 5_000,
    CHECKING_CANDIDATE: 5_000,
    DOWNLOADING: 5_000,
    RETRYING: 30_000,
};

export function NoaaImportStatus({
    api, organizationId, stationId, refreshKey, units, language, onUnauthorized, onImportFinished,
}: {
    api: BenchmarkApi;
    organizationId: string;
    stationId: string;
    refreshKey: number;
    units: DisplayUnits;
    language: UserLanguage;
    onUnauthorized: () => void;
    onImportFinished: () => void;
}) {
    const [status, setStatus] = useState<NoaaObservationStatus | null>(null);
    const [failure, setFailure] = useState<number | 'network' | null>(null);
    const wasInProgress = useRef(false);

    useEffect(() => {
        const controller = new AbortController();
        let timer: ReturnType<typeof setTimeout> | undefined;

        async function check() {
            try {
                const result = await api.getNoaaObservationStatus(organizationId, stationId, controller.signal);
                if (controller.signal.aborted) return;

                const delay = POLL_DELAY[result.state];
                const finished = wasInProgress.current && (result.state === 'READY' || result.state === 'NO_MATCH');
                wasInProgress.current = delay !== undefined;
                setStatus(result);
                setFailure(null);

                if (finished) onImportFinished();
                if (delay !== undefined) timer = setTimeout(check, delay);
            } catch (error) {
                if (controller.signal.aborted) return;
                if (error instanceof BenchmarkApiError && error.status === 401) {
                    onUnauthorized();
                    return;
                }
                setStatus(null);
                setFailure(error instanceof BenchmarkApiError ? error.status : 'network');
            }
        }

        void check();
        return () => {
            controller.abort();
            clearTimeout(timer);
        };
    }, [api, organizationId, stationId, refreshKey, onUnauthorized, onImportFinished]);

    if (status?.state === 'NOT_APPLICABLE') return null;

    const loading = !status && failure === null;
    const busy = loading || (status !== null && POLL_DELAY[status.state] !== undefined);

    const message = status && {
        DISABLED: t('NOAA observation imports are disabled.', language),
        PENDING: t('Waiting for the NOAA station search to start.', language),
        SEARCHING: t('Searching for a nearby active NOAA station…', language),
        CHECKING_CANDIDATE: t('Checking recent observations for this NOAA station…', language),
        DOWNLOADING: t('Downloading and checking hourly NOAA observations…', language),
        READY: t('NOAA observations are available.', language),
        NO_MATCH: t('No nearby NOAA station has enough recent observations.', language),
        RETRYING: t('Waiting to retry the NOAA import.', language),
        NOT_APPLICABLE: '',
    }[status.state];
    const locale = language === 'es' ? 'es' : 'en-US';
    const distanceKm = status?.distanceKm;
    const distance = distanceKm == null ? null : new Intl.NumberFormat(locale, {
        style: 'unit',
        unit: units === 'IMPERIAL' ? 'mile' : 'kilometer',
        maximumFractionDigits: 1,
    }).format(units === 'IMPERIAL' ? distanceKm / 1.609344 : distanceKm);
    const loadedThrough = status?.loadedThroughUtc && new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeZone: 'UTC',
    }).format(new Date(`${status.loadedThroughUtc}T00:00:00Z`));

    return <div className="alert neutral compact" role="status">
        {busy
            ? <LoaderCircle className="spin" size={18} aria-hidden="true" />
            : <Info size={18} aria-hidden="true" />}
        <div>
            <strong>{t('NOAA observation import', language)}</strong>
            {failure !== null ? <span>
                {t('Unable to check the NOAA import status.', language)}
                {typeof failure === 'number' && ` (HTTP ${failure})`}
            </span> : <span>{loading ? t('Checking NOAA import status…', language) : message}</span>}
            {status?.candidateNoaaStationId &&
                <span>{t('NOAA station being checked', language)} · {status.candidateNoaaStationId}</span>}
            {status?.selectedNoaaStationId &&
                <span>{t('Selected NOAA station', language)} · {status.selectedNoaaStationId}
                    {distance && ` (${distance})`}
                </span>}
            {loadedThrough && <span>{t('Import checked through (UTC)', language)} · {loadedThrough}</span>}
        </div>
    </div>;
}
