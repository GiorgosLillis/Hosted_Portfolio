const favoriteButton = document.getElementById('favorite-button');
const favoriteSection = document.getElementById('favorite-section');
const searchSection = document.getElementById('search-section');
const cityInput = document.getElementById('city-input');
const countryInput = document.getElementById('country-input');
favoriteButton.addEventListener('click', toogleFavorites);

export function toogleFavorites(){
    const isHidden = (favoriteSection.className.includes('search-section-hidden'));
    searchSection.className = searchSection.className.replace('search-section-visible', 'search-section-hidden');
    cityInput.className = cityInput.className.replace('search-input-visible', 'search-input-hidden');
    countryInput .className = countryInput .className.replace('search-input-visible', 'search-input-hidden');

    if(isHidden){
      
      favoriteSection.className = favoriteSection.className.replace('search-section-hidden', 'search-section-visible');   
      showFavorites();
    }else{
      favoriteSection.innerHTML = ''; 
      favoriteSection.className = favoriteSection.className.replace('search-section-visible', 'search-section-hidden'); 
    }
}

function showFavorites(){
    const favList = JSON.parse(localStorage.getItem('favoriteLocations'));
    favoriteSection.innerHTML = '';

    if (favList && favList.length > 0) {
        favList.forEach(fav => {
            const favButton = document.createElement('h2');
            favButton.textContent = `${fav.city}, ${fav.country}`;
            favButton.classList = 'my-2 favButton';
            favButton.addEventListener('click', () => selectFav(fav));
            favButton.ariaLabel = `${fav.city}, ${fav.country}`; // Parethenses so it wont run immediately  
            favoriteSection.appendChild(favButton);
        });
    }
    else{
        console.log('No favorite cities');
        const noFavoritesMessage = document.createElement('h2');
        noFavoritesMessage.id = 'noFavorites';
        noFavoritesMessage.classList = 'fs-3 mx-md-5';
        noFavoritesMessage.textContent = 'No favorite cities';
        favoriteSection.appendChild(noFavoritesMessage);
    }
}

export function selectFav(fav){
    const city = fav.city.trim();
    const country = fav.country.trim();
    const searchEvent = new CustomEvent('favSearch', { detail: { city, country } });
    document.dispatchEvent(searchEvent);
}