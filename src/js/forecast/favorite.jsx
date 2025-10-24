import React from 'react';

const Favorites = ({ favorites, onSelectFavorite }) => {
    return (
        <section id="favorite-section" className="search-section-visible">
            {favorites && favorites.length > 0 ? (
                favorites.map(fav => (
                    <h2 key={`${fav.name}-${fav.country}`} className='my-2 fs-3 mx-3 favButton' onClick={() => onSelectFavorite(fav)}>
                        {fav.name}, {fav.country}
                    </h2>
                ))
            ) : (
                <h2 id="noFavorites" className='fs-3 mx-md-5'>No favorite cities</h2>
            )}
        </section>
    );
};

export default Favorites;