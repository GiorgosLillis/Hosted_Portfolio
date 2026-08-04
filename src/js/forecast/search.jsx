import React, { useEffect, useRef } from 'react';
import Favorites from './favorite.jsx';

// City/country search inputs, submits on Enter
const Search = ({ city, onCityChange, country, onCountryChange, onSearch, onClose }) => {
    const cityInputRef = useRef(null);

    // Moves focus into the panel the moment it opens 
    useEffect(() => {
        cityInputRef.current?.focus();
    }, []);

    const handleKeyDown = (event) => {
        if (event.key === 'Enter') {
            onSearch(city, country);
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
                placeholder="Enter city"
                aria-label="Enter city"
                value={city}
                onChange={(e) => onCityChange(e.target.value)}
                id='city-input'
                onKeyDown={handleKeyDown}
            />
            <input
                type="text"
                className="form-control fs-5"
                placeholder="Enter country"
                aria-label="Enter country"
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
    onSaveFavorites,
    searchCity,
    onSearchCityChange,
    searchCountry,
    onSearchCountryChange
}) => {

    const handleSearchFromPanel = (city, country) => {
        onSearch(city, country);
    };

    const searchToggleRef = useRef(null);
    const favoritesToggleRef = useRef(null);

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

    return (
        <header className="sticky-top">
            <nav id="navbar" className="navbar navbar-expand d-flex align-items-start">
                <section className="container-fluid d-flex justify-content-end align-items-center px-0 py-2">
                    <ul className="navbar-nav d-flex align-items-center flex-row">
                        <li className="nav-item mx-3">
                            <button onClick={onSaveFavorites} className="icon-button nav-button" aria-label="Save favorite locations">
                                <i className="bi bi-cloud-upload-fill" aria-hidden="true"></i>
                            </button>
                        </li>
                        <li className="nav-item mx-3">
                            <button ref={favoritesToggleRef} onClick={onToggleFavorites} className="icon-button nav-button" aria-label="Show favorite locations" aria-expanded={isFavoritesOpen} aria-controls="favorite-section">
                                <i className="bi bi-star-fill" aria-hidden="true"></i>
                            </button>
                        </li>
                        <li className="nav-item mx-3">
                            <button ref={searchToggleRef} onClick={onToggleSearch} className="icon-button nav-button" aria-label="Search for a location" aria-expanded={isSearchOpen} aria-controls="search-section">
                                <i className="bi bi-search" aria-hidden="true"></i>
                            </button>
                        </li>
                        <li className="nav-item mx-3">
                            <a className="icon-button nav-button" href="./profile.html" aria-label="Go to profile" target="_blank" rel="noopener noreferrer">
                                <i className="bi bi-person-fill" aria-hidden="true"></i>
                            </a>
                        </li>
                        <li className="nav-item ms-3 me-3 me-lg-4">
                            <a className="icon-button nav-button" href="./index.html" aria-label="Go to home">
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
                    onClose={onToggleFavorites}
                />
            )}
        </header>
    );
};

export default Header;