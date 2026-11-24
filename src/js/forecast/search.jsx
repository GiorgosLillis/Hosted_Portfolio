import React, { useEffect, useRef } from 'react';
import Favorites from './favorite.jsx';
import Recent from './recent.jsx';
import { useTranslation } from 'react-i18next';
import { syncNavbarHeight } from '../common/i18n.js';

const buildHourOptions = (language) => Array.from({ length: 24 }, (_, hour) => ({
    value: hour,
    label: new Date(2000, 0, 1, hour).toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }),
}));

// City, optional state/region and country search inputs, submits on Enter
const Search = ({ city, onCityChange, state, onStateChange, country, onCountryChange, onSearch, onClose }) => {
    const cityInputRef = useRef(null);
    const { t } = useTranslation();

    // Moves focus into the panel the moment it opens 
    useEffect(() => {
        cityInputRef.current?.focus();
    }, []);

    const handleKeyDown = (event) => {
        if (event.key === 'Enter') {
            onSearch(city, country, state);
        } else if (event.key === 'Escape') {
            onClose();
        }
    };

    return (
        <section
            id="search-section"
            className="search-section-visible d-flex justify-content-end"
        >
            <input
                ref={cityInputRef}
                type="text"
                className="form-control fs-5"
                placeholder={t('fc-enter-city')}
                aria-label={t('fc-enter-city')}
                value={city}
                onChange={(e) => onCityChange(e.target.value)}
                id='city-input'
                onKeyDown={handleKeyDown}
            />
            <input
                type="text"
                className="form-control fs-5"
                placeholder={t('fc-enter-state')}
                aria-label={t('fc-enter-state')}
                value={state}
                id='state-input'
                maxLength={100}
                onChange={(e) => onStateChange(e.target.value)}
                onKeyDown={handleKeyDown}
            />
            <input
                type="text"
                className="form-control fs-5"
                placeholder={t('fc-enter-country')}
                aria-label={t('fc-enter-country')}
                value={country}
                id='country-input'
                onChange={(e) => onCountryChange(e.target.value)}
                onKeyDown={handleKeyDown}
            />
        </section>
    );
};

// Top nav bar for the weather page, also owns which panel (search/favorites) is open
const Header = ({
    onSearch,
    onToggleFavorites,
    onToggleSearch,
    isSearchOpen,
    isFavoritesOpen,
    favorites,
    onSelectFavorite,
    onRemoveFavorite,
    onSaveFavorites,
    searchCity,
    onSearchCityChange,
    searchCountry,
    onSearchCountryChange,
    searchState,
    onSearchStateChange,
    isPushSubscribed,
    isPushLoading,
    onTogglePush,
    notifyHour,
    onChangeNotifyHour,
    isRecentOpen,
    recent,
    onSelectRecent,
    onClearRecent,
    onToggleRecent
}) => {
    const { t, i18n } = useTranslation();
    const hourOptions = buildHourOptions(i18n.language);

    const handleSearchFromPanel = (city, country, state) => {
        onSearch(city, country, state);
    };

    // The language switcher is positioned from the navbar's height, which changes once the alert time appears under the bell
    useEffect(() => {
        syncNavbarHeight();
    }, [isPushSubscribed, i18n.language]);

    const searchToggleRef = useRef(null);
    const favoritesToggleRef = useRef(null);
    const recentToggleRef = useRef(null);

    // Returns focus to the toggle button once its panel closes
    const wasSearchOpen = useRef(isSearchOpen);
    useEffect(() => {
        if (wasSearchOpen.current && !isSearchOpen) {
            searchToggleRef.current?.focus();
        }
        wasSearchOpen.current = isSearchOpen;
    }, [isSearchOpen]);

    const wasFavoritesOpen = useRef(isFavoritesOpen);
    useEffect(() => {
        if (wasFavoritesOpen.current && !isFavoritesOpen) {
            favoritesToggleRef.current?.focus();
        }
        wasFavoritesOpen.current = isFavoritesOpen;
    }, [isFavoritesOpen]);

    const wasRecentOpen = useRef(isRecentOpen);
    useEffect(() => {
        if (wasRecentOpen.current && !isRecentOpen) {
            recentToggleRef.current?.focus();
        }
        wasRecentOpen.current = isRecentOpen;
    }, [isRecentOpen]);

    return (
        <header className="sticky-top">
            <nav id="navbar" className="navbar navbar-expand d-flex align-items-start">
                <section className="container-fluid d-flex justify-content-end align-items-center px-0 py-2">
                    <ul className="navbar-nav d-flex align-items-center flex-row">
                        <li className="nav-item mx-2 mx-md-3 d-flex flex-column align-items-center">
                            <button
                                onClick={onTogglePush}
                                className="icon-button nav-button"
                                aria-label={isPushSubscribed ? t('fc-alerts-disable') : t('fc-alerts-enable')}
                                aria-pressed={isPushSubscribed}
                                disabled={isPushLoading}
                            >
                                <i className={`bi ${isPushSubscribed ? 'bi-bell-fill' : 'bi-bell'}`} aria-hidden="true"></i>
                            </button>
                            {isPushSubscribed && (
                                <select
                                    className="form-select form-select-sm hour-dropdown"
                                    value={notifyHour}
                                    onChange={(e) => onChangeNotifyHour(parseInt(e.target.value, 10))}
                                    disabled={isPushLoading}
                                    aria-label={t('fc-alert-time')}
                                >
                                    {hourOptions.map(({ value, label }) => (
                                        <option key={value} value={value}>{label}</option>
                                    ))}
                                </select>
                            )}
                        </li>
                        <li className="nav-item mx-2 mx-md-3">
                            <button ref={recentToggleRef} onClick={onToggleRecent} className="icon-button nav-button" aria-label={t('fc-recent-aria')} aria-expanded={isRecentOpen} aria-controls="recent-section">
                                <i className="bi bi-clock-history" aria-hidden="true"></i>
                            </button>
                        </li>
                        <li className="nav-item mx-2 mx-md-3">
                            <button onClick={onSaveFavorites} className="icon-button nav-button" aria-label={t('fc-save-favorites')}>
                                <i className="bi bi-cloud-upload-fill" aria-hidden="true"></i>
                            </button>
                        </li>
                        <li className="nav-item mx-2 mx-md-3">
                            <button ref={favoritesToggleRef} onClick={onToggleFavorites} className="icon-button nav-button" aria-label={t('fc-show-favorites')} aria-expanded={isFavoritesOpen} aria-controls="favorite-section">
                                <i className="bi bi-star-fill" aria-hidden="true"></i>
                            </button>
                        </li>
                        <li className="nav-item mx-2 mx-md-3">
                            <button ref={searchToggleRef} onClick={onToggleSearch} className="icon-button nav-button" aria-label={t('fc-search-aria')} aria-expanded={isSearchOpen} aria-controls="search-section">
                                <i className="bi bi-search" aria-hidden="true"></i>
                            </button>
                        </li>

                        <li className="nav-item mx-2 mx-md-3">
                            <a className="icon-button nav-button" href="./profile.html" aria-label={t('fc-profile-aria')} target="_blank" rel="noopener noreferrer">
                                <i className="bi bi-person-fill" aria-hidden="true"></i>
                            </a>
                        </li>
                        <li className="nav-item mx-2 mx-md-3">
                            <a className="icon-button nav-button" href="./index.html" aria-label={t('home-aria')}>
                                <i className="bi bi-house-door-fill" aria-hidden="true"></i>
                            </a>
                        </li>
                    </ul>
                </section>
            </nav>
            {isSearchOpen && (
                <Search
                    city={searchCity}
                    onCityChange={onSearchCityChange}
                    state={searchState}
                    onStateChange={onSearchStateChange}
                    country={searchCountry}
                    onCountryChange={onSearchCountryChange}
                    onSearch={handleSearchFromPanel}
                    onClose={onToggleSearch}
                />
            )}
            {isFavoritesOpen && (
                <Favorites
                    favorites={favorites}
                    onSelectFavorite={onSelectFavorite}
                    onRemoveFavorite={onRemoveFavorite}
                    onClose={onToggleFavorites}
                />
            )}
            {isRecentOpen && (
                <Recent
                    recent={recent}
                    onSelectRecent={onSelectRecent}
                    onClear={onClearRecent}
                    onClose={onToggleRecent}
                />
            )}
        </header>
    );
};

export default Header;