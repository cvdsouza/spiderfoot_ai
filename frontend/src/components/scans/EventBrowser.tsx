import { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getScanEventsPaged, getScanEventsUnique } from '../../api/results';

type ApiRow = Array<string | number | boolean | null>;

const PAGE_SIZE = 100;

interface EventBrowserProps {
  scanId: string;
  isRunning: boolean;
  initialEventType?: string;
  eventTypes?: string[];
}

export default function EventBrowser({
  scanId,
  isRunning,
  initialEventType = 'ALL',
  eventTypes = [],
}: EventBrowserProps) {
  const [eventType, setEventType] = useState(initialEventType);
  const [filterFp, setFilterFp] = useState(false);
  const [viewMode, setViewMode] = useState<'all' | 'unique'>('all');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);

  const [prevInitialEventType, setPrevInitialEventType] = useState(initialEventType);
  if (initialEventType !== prevInitialEventType) {
    setPrevInitialEventType(initialEventType);
    setEventType(initialEventType);
    setPage(0);
  }

  const { data: pagedResult, isLoading } = useQuery({
    queryKey: ['scanEventsPaged', scanId, eventType, filterFp, searchQuery, page],
    queryFn: async () => {
      const { data } = await getScanEventsPaged(
        scanId, eventType, filterFp, searchQuery || undefined, PAGE_SIZE, page * PAGE_SIZE,
      );
      return data as { total: number; data: ApiRow[] };
    },
    enabled: viewMode === 'all',
    refetchInterval: isRunning ? 10000 : false,
  });

  const { data: uniqueEvents = [], isLoading: isLoadingUnique } = useQuery({
    queryKey: ['scanEventsUnique', scanId, eventType, filterFp],
    queryFn: async () => {
      const { data } = await getScanEventsUnique(scanId, eventType, filterFp);
      return data as ApiRow[];
    },
    enabled: viewMode === 'unique' && eventType !== 'ALL',
  });

  const events = pagedResult?.data ?? [];
  const total = pagedResult?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const to = Math.min((page + 1) * PAGE_SIZE, total);

  function commitSearch() {
    setSearchQuery(searchInput);
    setPage(0);
  }

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
        {/* Event type */}
        <select
          value={eventType}
          onChange={(e) => { setEventType(e.target.value); setPage(0); }}
          style={{
            background: '#060A0F', border: '1px solid #18181B', borderRadius: '2px',
            padding: '6px 10px', color: '#A1A1AA', fontSize: '11px', cursor: 'pointer',
          }}
        >
          <option value="ALL">ALL TYPES</option>
          {eventTypes.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        {/* Search */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <input
            ref={searchRef}
            type="text"
            placeholder="search data..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && commitSearch()}
            style={{
              background: '#060A0F', border: '1px solid #18181B', borderRadius: '2px',
              padding: '6px 10px', color: '#F4F4F5', fontSize: '11px', outline: 'none', width: '200px',
            }}
          />
          <button
            onClick={commitSearch}
            style={{
              background: '#00B4FF', color: '#000', border: 'none',
              padding: '6px 12px', borderRadius: '2px',
              fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', cursor: 'pointer',
            }}
          >
            SEARCH
          </button>
          {searchQuery && (
            <button
              onClick={() => { setSearchInput(''); setSearchQuery(''); }}
              style={{
                background: 'none', color: '#52525B', border: '1px solid #27272A',
                padding: '6px 10px', borderRadius: '2px', fontSize: '10px', cursor: 'pointer',
              }}
            >
              CLEAR
            </button>
          )}
        </div>

        {/* Hide FP */}
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: '#71717A', letterSpacing: '0.08em', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={filterFp}
            onChange={(e) => { setFilterFp(e.target.checked); setPage(0); }}
            style={{ accentColor: '#00B4FF', cursor: 'pointer' }}
          />
          HIDE FP
        </label>

        {/* View mode */}
        <div style={{ display: 'flex', gap: '2px', background: '#060A0F', padding: '3px', borderRadius: '2px', border: '1px solid #18181B' }}>
          <button
            onClick={() => setViewMode('all')}
            style={{
              padding: '4px 10px', background: viewMode === 'all' ? '#00B4FF' : 'transparent',
              color: viewMode === 'all' ? '#000' : '#52525B', border: 'none', borderRadius: '2px',
              fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', cursor: 'pointer',
            }}
          >
            ALL
          </button>
          <button
            onClick={() => setViewMode('unique')}
            disabled={eventType === 'ALL'}
            style={{
              padding: '4px 10px', background: viewMode === 'unique' ? '#00B4FF' : 'transparent',
              color: viewMode === 'unique' ? '#000' : '#52525B', border: 'none', borderRadius: '2px',
              fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em',
              cursor: eventType === 'ALL' ? 'not-allowed' : 'pointer', opacity: eventType === 'ALL' ? 0.4 : 1,
            }}
          >
            UNIQUE
          </button>
        </div>

        <span style={{ marginLeft: 'auto', fontSize: '10px', color: '#52525B', letterSpacing: '0.05em' }}>
          {viewMode === 'all'
            ? total > 0 ? `${from}–${to} OF ${total.toLocaleString()}` : '0 RESULTS'
            : `${uniqueEvents.length} UNIQUE`}
        </span>
      </div>

      {/* Active search chip */}
      {searchQuery && (
        <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '10px', color: '#52525B' }}>
          <span style={{ letterSpacing: '0.1em' }}>FILTER:</span>
          <span style={{ background: '#001828', color: '#00B4FF', border: '1px solid #00B4FF30', borderRadius: '2px', padding: '2px 8px', fontFamily: 'monospace' }}>
            "{searchQuery}"
          </span>
        </div>
      )}

      {/* Results */}
      {(isLoading || isLoadingUnique) ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '32px' }}>
          <div style={{
            width: '24px', height: '24px', borderRadius: '50%',
            border: '2px solid #00B4FF30', borderTopColor: '#00B4FF',
            animation: 'sf-spin 1.2s linear infinite',
          }} />
        </div>
      ) : viewMode === 'all' ? (
        <>
          <div style={{ border: '1px solid #18181B', borderRadius: '2px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
              <thead>
                <tr style={{ background: '#060A0F', borderBottom: '1px solid #18181B' }}>
                  {['LAST SEEN', 'DATA', 'SOURCE', 'MODULE', 'TYPE', 'FP'].map((h) => (
                    <th key={h} style={{ padding: '6px 12px', textAlign: 'left', fontSize: '8px', letterSpacing: '0.15em', color: '#3F3F46', fontWeight: 700 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {events.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: '32px', textAlign: 'center', fontSize: '9px', letterSpacing: '0.2em', color: '#3F3F46' }}>
                      {searchQuery ? `NO RESULTS MATCHING "${searchQuery.toUpperCase()}"` : 'NO EVENTS FOUND'}
                    </td>
                  </tr>
                ) : (
                  events.map((row: ApiRow, idx: number) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #0D1117' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#0D1117')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ padding: '6px 12px', whiteSpace: 'nowrap', color: '#52525B', fontSize: '10px' }}>{row[0]}</td>
                      <td style={{ padding: '6px 12px', fontFamily: 'monospace', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#A1A1AA' }}>{row[1]}</td>
                      <td style={{ padding: '6px 12px', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#71717A' }}>{row[2]}</td>
                      <td style={{ padding: '6px 12px', fontFamily: 'monospace', whiteSpace: 'nowrap', color: '#00B4FF' }}>{row[3]}</td>
                      <td style={{ padding: '6px 12px', fontFamily: 'monospace', whiteSpace: 'nowrap', color: '#71717A' }}>{row[10]}</td>
                      <td style={{ padding: '6px 12px' }}>
                        {row[8] === 1 && (
                          <span style={{ background: '#271500', color: '#FF9F0A', border: '1px solid #FF9F0A40', borderRadius: '2px', padding: '1px 5px', fontSize: '9px', fontWeight: 700 }}>FP</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {total > PAGE_SIZE && (
            <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                style={{
                  background: 'none', color: page === 0 ? '#3F3F46' : '#00B4FF',
                  border: `1px solid ${page === 0 ? '#27272A' : '#00B4FF40'}`,
                  padding: '6px 14px', borderRadius: '2px',
                  fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em',
                  cursor: page === 0 ? 'not-allowed' : 'pointer',
                }}
              >
                ← PREV
              </button>
              <span style={{ fontSize: '10px', color: '#52525B', letterSpacing: '0.1em' }}>
                PAGE {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                style={{
                  background: 'none', color: page >= totalPages - 1 ? '#3F3F46' : '#00B4FF',
                  border: `1px solid ${page >= totalPages - 1 ? '#27272A' : '#00B4FF40'}`,
                  padding: '6px 14px', borderRadius: '2px',
                  fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em',
                  cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer',
                }}
              >
                NEXT →
              </button>
            </div>
          )}
        </>
      ) : (
        <div style={{ border: '1px solid #18181B', borderRadius: '2px', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
            <thead>
              <tr style={{ background: '#060A0F', borderBottom: '1px solid #18181B' }}>
                {['VALUE', 'COUNT'].map((h) => (
                  <th key={h} style={{ padding: '6px 12px', textAlign: 'left', fontSize: '8px', letterSpacing: '0.15em', color: '#3F3F46', fontWeight: 700 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {uniqueEvents.length === 0 ? (
                <tr>
                  <td colSpan={2} style={{ padding: '32px', textAlign: 'center', fontSize: '9px', letterSpacing: '0.2em', color: '#3F3F46' }}>
                    {eventType === 'ALL' ? 'SELECT A SPECIFIC EVENT TYPE TO VIEW UNIQUE VALUES' : 'NO UNIQUE EVENTS FOUND'}
                  </td>
                </tr>
              ) : (
                uniqueEvents.map((row: ApiRow, idx: number) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #0D1117' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#0D1117')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '6px 12px', fontFamily: 'monospace', color: '#A1A1AA', maxWidth: '500px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row[0]}</td>
                    <td style={{ padding: '6px 12px', color: '#71717A' }}>{row[1]}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
