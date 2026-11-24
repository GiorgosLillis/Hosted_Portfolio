import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlaceNames, formatPlace } from './functions.jsx';

// Side panel (same look as the hour details) listing recently viewed cities, newest first
const Recent = ({ recent, onSelectRecent, onClear, onClose }) => {
    const sectionRef = useRef(null);
    const { t, i18n } = useTranslation();
    usePlaceNames();

    const formatSearchedAt = (timestamp) => timestamp
        ? new Date(timestamp).toLocaleString(i18n.language, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
        : '';

    // Moves focus into the panel the moment it opens and lets Escape close it
    useEffect(() => {
        sectionRef.current?.focus();
    }, []);

    const handleKeyDown = (event) => {
        if (event.key === 'Escape') {
            onClose();
        }
    };

    return (
        <div className="hour-details-container recent-container">
            <section id="recent-section" ref={sectionRef} tabIndex={-1} onKeyDown={handleKeyDown} className="h-100 hour-details">
                <button type="button" onClick={onClose} className="btn-close btn-close-white" aria-label={t('close')}></button>
                <h3 className="mt-3 mb-4">{t('fc-recent-title')}</h3>
                {recent && recent.length > 0 ? (
                    <>
                    <ol className="list-unstyled mb-3">
                        {recent.map(entry => (
                            <li key={`${entry.latitude},${entry.longitude}`} className="mb-3">
                                <button
                                    type="button"
                                    className="favButton d-block p-0"
                                    onClick={() => onSelectRecent(entry)}
                                >
                                    {formatPlace(entry)}
                                    <small className="d-block d-lg-inline ms-lg-2 opacity-75">{formatSearchedAt(entry.searchedAt)}</small>
                                </button>
                            </li>
                        ))}
                    </ol>
                    <button type="button" className="btn btn-outline-light btn-sm" onClick={onClear}>{t('fc-recent-clear')}</button>
                    </>
                ) : (
                    <p>{t('fc-recent-empty')}</p>
                )}
            </section>
        </div>
    );
};

export default Recent;
