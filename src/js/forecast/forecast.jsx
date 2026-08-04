import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { LoadingIndicator, ErrorMessage, setBackgroundImage, isFavorite, WarningMessage } from './functions.jsx';
import CurrentWeather from './current-weather.jsx';
import { fetchWeather, getLocation, getCachedWeather, getCityLocation } from '../weather/weather-api.js';
import WeatherForecast from './daily-card.jsx';
import ViewToggle from './view-toggle.jsx';
import HourlyForecast from './hourly-card.jsx';
import Header from './search.jsx';
import { saveCityList, loadCityList } from './memory-handle.js';

// Last-viewed city survives a refresh, expires after an hour like the weather cache
const LAST_LOCATION_KEY = 'lastViewedLocation';
const LAST_LOCATION_TTL_MS = 60 * 60 * 1000;

// Top-level weather page component, owns all the state and wires the search/favorites/daily/hourly views together
function Forecast() {
    const [weatherData, setWeatherData] = useState(null);
    const [locationInfo, setLocationInfo] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [warning, setWarning] = useState(null);
    const [lastUpdate, setLastUpdate] = useState(null);
    const [viewMode, setViewMode] = useState('daily');
    const [Unit, setUnit] = useState('celsius');
    const [selectedDayHourly, setSelectedDayHourly] = useState(null);
    const [selectedDate, setSelectedDate] = useState(null);
    const [favorites, setFavorites] = useState([]);
    const [removedFavorites, setRemovedFavorites] = useState([]);
    const [openPanel, setOpenPanel] = useState(null); // null, 'search', or 'favorites'
    const [searchCity, setSearchCity] = useState('');
    const [searchCountry, setSearchCountry] = useState('');


    // Load saved favorite cities on first render (server if logged in, localStorage otherwise)
    useEffect(() => {
        const initializeFavorites = async () => {
            const list = await loadCityList();
            setFavorites(list);
        };
        initializeFavorites();
    }, []);

    // On load, restore whichever city was last viewed
    useEffect(() => {
        const savedLocation = JSON.parse(localStorage.getItem(LAST_LOCATION_KEY));
        const isFresh = savedLocation && (Date.now() - savedLocation.timestamp < LAST_LOCATION_TTL_MS);
        if (isFresh) {
            console.log("Restoring last viewed location from localStorage");
            fetchWeatherDataForCity({
                name: savedLocation.city,
                country: savedLocation.country,
                latitude: savedLocation.latitude,
                longitude: savedLocation.longitude,
            });
        } else {
            if (savedLocation) {
                localStorage.removeItem(LAST_LOCATION_KEY);
            }
            console.log("No fresh last viewed location saved, initializing weather for current location");
            initializeWeather();
        }
    }, []);

    // Weather for a searched/favorited city
    const fetchWeatherDataForCity = async ({ name, country, latitude, longitude }) => {
        try {
            setError(null);
            setWarning(null);
            setLoading(true);

            let location;
            if (latitude && longitude) {
                location = {
                    city: name,
                    country: country,
                    latitude: latitude,
                    longitude: longitude,
                };
            } else {
                location = await getCityLocation(name, country);
            }

            if (!location) {
                throw new Error("Unable to retrieve location for the specified city");
            }

            let weatherData;
            const cachedWeather = getCachedWeather(location);
            if (cachedWeather !== null) {
                weatherData = cachedWeather;
            }
            else {
                weatherData = await fetchWeather(location);
            }
            if (!weatherData) {
                throw new Error("Unable to fetch weather data");
            }
            setLocationInfo(location);
            setWeatherData(weatherData);
            setLastUpdate(new Date(weatherData.time));
            localStorage.setItem(LAST_LOCATION_KEY, JSON.stringify({ ...location, timestamp: Date.now() }));

            if (!country) {
                setWarning("No country specified. Picked the most common result.");
            }
            else if (weatherData.country != country) {
                setWarning("This city has not been found in this country! Picked the most common result.");
            }
        } catch (err) {
            console.error("Weather fetch for city failed:", err);
            if (weatherData) {
                setWarning(err.message || "Failed to fetch weather data for the city");
            } else {
                setError(err.message || "Failed to fetch weather data for the city");
            }
        } finally {
            setLoading(false);
        }
    };

    // Weather for the browser's current geolocation
    const initializeWeather = async () => {
        try {
            setError(null);
            setWarning(null);
            setLoading(true);

            let location;
            location = await getLocation();
            if (!location) {
                throw new Error("Unable to retrieve location");
            }

            let weatherData;
            const cachedWeather = getCachedWeather();
            if (cachedWeather !== null) {
                weatherData = cachedWeather;
            }
            else {
                weatherData = await fetchWeather(location);
            }
            if (!weatherData) {
                throw new Error("Unable to fetch weather data");
            }
            setLocationInfo(location);
            setWeatherData(weatherData);
            setLastUpdate(new Date(weatherData.time));
            localStorage.setItem(LAST_LOCATION_KEY, JSON.stringify({ ...location, timestamp: Date.now() }));

        } catch (err) {
            console.error("Weather initialization failed:", err);
            if (weatherData) {
                setWarning(err.message || "Failed to fetch weather data");
            } else {
                setError(err.message || "Failed to fetch weather data");
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (weatherData?.current?.img) {
            setBackgroundImage(weatherData.current.img);
        } else {
            console.warn("weatherData.current.img is undefined. Not setting background image.");
        }
    }, [weatherData?.current?.img]);

    // Listens for the custom "saveFavorites" event 
    useEffect(() => {
        const handleSave = async () => {
            const result = await saveCityList(favorites, removedFavorites);
            if (result.success) {
                setRemovedFavorites([]);
            }
        };

        document.addEventListener('saveFavorites', handleSave);

        return () => {
            document.removeEventListener('saveFavorites', handleSave);
        };
    }, [favorites, removedFavorites]);

    // Clicking a day in the daily forecast switches to the hourly view for just that day
    const handleDayClick = (day) => {
        // Full calendar date, not just day-of-month to avoid false matches across a month boundary
        const selectedDate = new Date(day.date);
        const hourlyForSelectedDay = weatherData.hourly.filter(hour => {
            const hourDate = new Date(hour.timestamp);
            return hourDate.getFullYear() === selectedDate.getFullYear() &&
                hourDate.getMonth() === selectedDate.getMonth() &&
                hourDate.getDate() === selectedDate.getDate();
        });
        setSelectedDayHourly(hourlyForSelectedDay);
        setSelectedDate(selectedDate);
        setViewMode('hourly');
    };

    const handleSelectFavorite = (fav) => {
        setOpenPanel(null);
        fetchWeatherDataForCity(fav);
    };

    const handleSaveFavorites = () => {
        document.dispatchEvent(new CustomEvent('saveFavorites'));
    };

    const togglePanel = (panel) => {
        setOpenPanel(prev => prev === panel ? null : panel);
    };

    // Shared by both the search icon and pressing Enter in the search inputs, so empty fields behave the same either way
    const handleSearch = async (city, country) => {
        setOpenPanel(null);
        if (city === '' && country === '') {
            await initializeWeather();
            setWarning("Search fields are empty. Showing your current location.");
        } else if (city === '') {
            await initializeWeather();
            setWarning("City field is empty. Cannot search only by country. Showing your current location.");
        } else {
            fetchWeatherDataForCity({ name: city, country: country });
        }
    };

    // Clicking the search icon either opens the panel, or submits whatever was typed
    const handleSearchIconClick = () => {
        if (openPanel === 'search') {
            handleSearch(searchCity, searchCountry);
        } else {
            setOpenPanel('search');
        }
    };

    if (loading) {
        return <LoadingIndicator />;
    }

    if (error) {
        return <ErrorMessage error={error} />;
    }

    return (
        <>
            <Header
                onSearch={handleSearch}
                onToggleFavorites={() => togglePanel('favorites')}
                onToggleSearch={handleSearchIconClick}
                isSearchOpen={openPanel === 'search'}
                isFavoritesOpen={openPanel === 'favorites'}
                favorites={favorites}
                onSelectFavorite={handleSelectFavorite}
                onSaveFavorites={handleSaveFavorites}
                searchCity={searchCity}
                onSearchCityChange={setSearchCity}
                searchCountry={searchCountry}
                onSearchCountryChange={setSearchCountry}
            />

            <div id="main-content">
                <CurrentWeather
                    warning={warning}
                    error={error}
                    locationInfo={locationInfo}
                    weatherData={weatherData}
                    lastUpdate={lastUpdate}
                    Unit={Unit}
                    setUnit={setUnit}
                    isFavorite={isFavorite(locationInfo?.city, locationInfo?.country, favorites)}
                    addToFavorites={() => {
                        const updatedFavorites = [...favorites, { name: locationInfo?.city, country: locationInfo?.country, latitude: locationInfo?.latitude, longitude: locationInfo?.longitude }];
                        setFavorites(updatedFavorites);
                    }}
                    removeFromFavorites={() => {
                        const updatedFavorites = favorites.filter(fav => fav.name.toLowerCase() !== locationInfo?.city.toLowerCase() || fav.country.toLowerCase() !== locationInfo?.country.toLowerCase());
                        setFavorites(updatedFavorites);
                        setRemovedFavorites(prev => [...prev, { name: locationInfo?.city, country: locationInfo?.country }]);
                    }}
                />
                <div className="flex-grow-1 d-flex flex-column justify-content-end mt-3 mt-lg-4 pt-5">
                    <ViewToggle viewMode={viewMode} setViewMode={setViewMode} />
                    {viewMode === 'daily' ? (
                        <WeatherForecast dailyForecast={weatherData.daily} onDayClick={handleDayClick} Unit={Unit} />
                    ) : (
                        <HourlyForecast
                            hourlyForecast={selectedDayHourly || weatherData.hourly}
                            isToday={selectedDate ? new Date().toDateString() === selectedDate.toDateString() : true}
                            Unit={Unit}
                            dailyForecast={weatherData.daily}
                        />
                    )}
                </div>
            </div>
        </>
    );
}

document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('weather-app');
    if (container) {
        const root = ReactDOM.createRoot(container);
        root.render(<Forecast />);
    } else {
        const newContainer = document.createElement('div');
        newContainer.id = 'weather-app';
        document.body.appendChild(newContainer);

        const root = ReactDOM.createRoot(newContainer);
        root.render(<Forecast />);
    }
});