import React, { useEffect, useRef } from 'react';

// Dropdown-style panel listing saved cities, clicking one loads that city's weather
const Favorites = ({ favorites, onSelectFavorite, onClose }) => {
    const sectionRef = useRef(null);

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
        <section id="favorite-section" ref={sectionRef} tabIndex={-1} onKeyDown={handleKeyDown} className="search-section-visible">
            {favorites && favorites.length > 0 ? (
                favorites.map(fav => (
                    <button
                        key={`${fav.name}-${fav.country}`}
                        type="button"
                        className="my-2 fs-3 mx-3 favButton d-block"
                        onClick={() => onSelectFavorite(fav)}
                    >
                        {fav.name}, {fav.country}
                    </button>
                ))
            ) : (
                <h2 id="noFavorites" className='fs-3 mx-md-5'>No favorite cities</h2>
            )}
        </section>
    );
};

export default Favorites;