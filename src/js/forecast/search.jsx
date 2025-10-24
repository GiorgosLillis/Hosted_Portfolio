import React from 'react';
import Favorites from './favorite.jsx';

const Search = ({ city, onCityChange, country, onCountryChange, onSearch }) => {
    const handleKeyDown = (event) => {
        if (event.key === 'Enter') {
            onSearch(city, country);
        }
    };

    return (
        <section 
            className="search-section-visible d-flex justify-content-end"
        >
            <input 
                type="text" 
                className="form-control fs-5" 
                placeholder="Enter city" 
                value={city}
                onChange={(e) => onCityChange(e.target.value)}
                id='city-input'
                onKeyDown={handleKeyDown}
            />
            <input 
                type="text" 
                className="form-control fs-5" 
                placeholder="Enter country" 
                value={country}
                id='country-input'
                onChange={(e) => onCountryChange(e.target.value)}
                onKeyDown={handleKeyDown}
            />
        </section>
    );
};

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

    return (
        <header className="sticky-top">
            <nav id="navbar" className="navbar navbar-expand d-flex align-items-start">
                <section className="container-fluid d-flex justify-content-end align-items-center px-0 py-2">
                    <ul className="navbar-nav d-flex align-items-center flex-row">
                        <li className="nav-item mx-3">
                            <button onClick={onSaveFavorites} className="icon-button nav-button" aria-label="Save favorite locations">
                                <i className="bi bi-cloud-upload-fill"></i>
                            </button>
                        </li>
                        <li className="nav-item mx-3">
                            <button onClick={onToggleFavorites} className="icon-button nav-button" aria-label="Show favorite locations">
                                <i className="bi bi-star-fill"></i>
                            </button>
                        </li>
                        <li className="nav-item mx-3">
                            <button onClick={onToggleSearch} className="icon-button nav-button" aria-label="Search for a location">
                                <i className="bi bi-search"></i>
                            </button>
                        </li>
                        <li className="nav-item mx-3">
                            <a  className="icon-button nav-button" href="./profile.html" aria-label="Go to profile" target="_blank" rel="noopener noreferrer">
                                <i className="bi bi-person-fill"></i>
                            </a>
                        </li>  
                        <li className="nav-item ms-3 me-3 me-lg-4">
                            <a  className="icon-button nav-button" href="./index.html" aria-label="Go to home">
                                <i className="bi bi-house-door-fill"></i>
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
                />
            )}
            {isFavoritesOpen && (
                <Favorites
                    favorites={favorites}
                    onSelectFavorite={onSelectFavorite}
                />
            )}
        </header>
    );
};

export default Header;