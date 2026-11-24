import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlaceNames, formatPlace } from './functions.jsx';

// Side panel (same look as the hour details and the recent searches) listing saved cities, clicking one loads that city's weather
const Favorites = ({ favorites, onSelectFavorite, onRemoveFavorite, onClose }) => {
    const sectionRef = useRef(null);
    const { t } = useTranslation();
    usePlaceNames();

    // Moves focus into the panel the moment it opens and lets Escape close it same as clicking the toggle again
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
            <section id="favorite-section" ref={sectionRef} tabIndex={-1} onKeyDown={handleKeyDown} className="h-100 hour-details">
                <button type="button" onClick={onClose} className="btn-close btn-close-white" aria-label={t('close')}></button>
                <h3 className="mt-3 mb-4">{t('fc-favorites-title')}</h3>
                {favorites && favorites.length > 0 ? (
                    <ol className="list-unstyled mb-3">
                        {favorites.map(fav => (
                            <li key={`${fav.latitude},${fav.longitude}`} className="mb-3 d-flex align-items-center">
                                <button
                                    type="button"
                                    className="favButton d-block p-0"
                                    onClick={() => onSelectFavorite(fav)}
                                >
                                    {formatPlace(fav)}
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-link p-0 ms-3 flex-shrink-0"
                                    aria-label={t('fc-fav-delete', { name: formatPlace(fav) })}
                                    onClick={() => {
                                        onRemoveFavorite(fav);
                                        // The row (and the focused button with it) is about to disappear, keep keyboard focus inside the panel
                                        sectionRef.current?.focus();
                                    }}
                                >
                                    <i className="bi bi-trash" aria-hidden="true"></i>
                                </button>
                            </li>
                        ))}
                    </ol>
                ) : (
                    <p id="noFavorites">{t('fc-no-favorites')}</p>
                )}
            </section>
        </div>
    );
};

export default Favorites;
