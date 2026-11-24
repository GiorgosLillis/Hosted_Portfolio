import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { LoadingIndicator, ErrorMessage, setBackgroundImage, isFavorite, WarningMessage } from './functions.jsx';
import CurrentWeather from './current-weather.jsx';
import { fetchWeather, getLocation, getCachedWeather, getCityLocation } from '../weather/weather-api.js';
import { translatePlaces } from '../weather/place-names.js';
import { isSameLocation } from '../weather/location-match.js';
import { useTranslation } from 'react-i18next';
import WeatherForecast from './daily-card.jsx';
import ViewToggle from './view-toggle.jsx';
import HourlyForecast from './hourly-card.jsx';
import Header from './search.jsx';
import { loadRecents, addRecents, clearRecents } from '../weather/recent.js';
import { saveCityList, loadCityList } from './memory-handle.js';
import { isPushSupported, getExistingSubscription, subscribeToWeatherAlerts, unsubscribeFromWeatherAlerts, getStoredNotifyHour, updateAlertLanguage } from '../weather/push-notifications.js';
import { showToast } from '../common/toast.js';
import i18next from '../common/i18n.js';

// Same limits as api/database/cities.ts
const MAX_FAVORITES = 100;
const MAX_FAVORITE_TEXT_LENGTH = 100;

const t = (key, options) => i18next.t(key, options);

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
    const [openPanel, setOpenPanel] = useState(null); // null, 'search', 'favorites' or 'recent'
    const [searchCity, setSearchCity] = useState('');
    const [searchCountry, setSearchCountry] = useState('');
    const [searchState, setSearchState] = useState('');
    const [isPushSubscribed, setIsPushSubscribed] = useState(false);
    const [isPushLoading, setIsPushLoading] = useState(false);
    const [notifyHour, setNotifyHour] = useState(getStoredNotifyHour());
    const [recent, setRecent] = useState(loadRecents);
    const { i18n } = useTranslation();

    // The daily notification is written in the site's language, so a subscribed browser updates it when the language changes
    const previousLanguage = useRef(i18n.language);
    useEffect(() => {
        if (previousLanguage.current === i18n.language) {
            return;
        }
        previousLanguage.current = i18n.language;
        if (isPushSubscribed) {
            updateAlertLanguage().catch((err) => console.error('Could not update the alert language:', err));
        }
    }, [i18n.language]);

    // Stored names stay canonical, the translations for what is on screen are fetched on the side (the current city first)
    useEffect(() => {
        translatePlaces([locationInfo, ...recent, ...favorites]);
    }, [locationInfo?.latitude, locationInfo?.longitude, recent, favorites, i18n.language]);

    // Load saved favorite cities on first render (server if logged in, localStorage otherwise)
    useEffect(() => {
        const initializeFavorites = async () => {
            const list = await loadCityList();
            setFavorites(list);
        };
        initializeFavorites();
    }, []);

    // Reflects whatever this browser is actually subscribed to, not just a localStorage flag
    useEffect(() => {
        if (!isPushSupported()) {
            return;
        }
        let cancelled = false;
        getExistingSubscription().then((subscription) => {
            if (!cancelled) {
                setIsPushSubscribed(!!subscription);
            }
        });
        return () => {
            cancelled = true;
        };
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
                region: savedLocation.region,
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
    const fetchWeatherDataForCity = async ({ name, country, state, region, latitude, longitude }) => {
        try {
            setError(null);
            setWarning(null);
            setLoading(true);

            let location;
            if (latitude && longitude) {
                location = {
                    city: name,
                    country: country,
                    region: region,
                    latitude: latitude,
                    longitude: longitude,
                };
            } else {
                location = await getCityLocation(name, country, state);
            }

            if (!location) {
                throw new Error(t('fc-err-city-location'));
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
                throw new Error(t('fc-err-fetch'));
            }
            setLocationInfo(location);
            setWeatherData(weatherData);
            setLastUpdate(new Date(weatherData.time));
            localStorage.setItem(LAST_LOCATION_KEY, JSON.stringify({ ...location, timestamp: Date.now() }));
            setRecent(addRecents(location));
        } catch (err) {
            console.error("Weather fetch for city failed:", err);
            if (weatherData) {
                setWarning(err.message || t('fc-err-city-fetch-failed'));
            } else {
                setError(err.message || t('fc-err-city-fetch-failed'));
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
                throw new Error(t('fc-err-location'));
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
                throw new Error(t('fc-err-fetch'));
            }
            setLocationInfo(location);
            setWeatherData(weatherData);
            setLastUpdate(new Date(weatherData.time));
            localStorage.setItem(LAST_LOCATION_KEY, JSON.stringify({ ...location, timestamp: Date.now() }));

        } catch (err) {
            console.error("Weather initialization failed:", err);
            if (weatherData) {
                setWarning(err.message || t('fc-err-fetch-failed'));
            } else {
                setError(err.message || t('fc-err-fetch-failed'));
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
        const handleSave = () => saveCityList(favorites);

        document.addEventListener('saveFavorites', handleSave);

        return () => {
            document.removeEventListener('saveFavorites', handleSave);
        };
    }, [favorites]);

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

    // Same as un-starring the current city, but for any entry of the list, and like it only synced on the next save (which replaces the stored list)
    const handleRemoveFavorite = (fav) => {
        setFavorites(prev => prev.filter(item => item !== fav));
    };

    const handleSaveFavorites = () => {
        document.dispatchEvent(new CustomEvent('saveFavorites'));
    };

    const handleSelectRecent = (rec) => {
        setOpenPanel(null);
        fetchWeatherDataForCity(rec);
    };

    const togglePanel = (panel) => {
        setOpenPanel(prev => prev === panel ? null : panel);
    };

    // Shared by both the search icon and pressing Enter in the search inputs, so empty fields behave the same either way
    const handleSearch = async (city, country, state = '') => {
        setOpenPanel(null);
        if (city === '' && country === '') {
            await initializeWeather();
            setWarning({ key: 'fc-warn-empty-fields' });
        } else if (city === '') {
            await initializeWeather();
            setWarning({ key: 'fc-warn-empty-city' });
        } else {
            fetchWeatherDataForCity({ name: city, country: country, state: state });
        }
    };

    // Clicking the search icon either opens the panel, or submits whatever was typed
    const handleSearchIconClick = () => {
        if (openPanel === 'search') {
            handleSearch(searchCity, searchCountry, searchState);
        } else {
            setOpenPanel('search');
        }
    };

    const handleTogglePush = async () => {
        if (!isPushSupported()) {
            showToast(t('push-unsupported'), 'danger');
            return;
        }

        setIsPushLoading(true);
        try {
            if (isPushSubscribed) {
                await unsubscribeFromWeatherAlerts();
                setIsPushSubscribed(false);
                showToast(t('fc-alerts-off'), 'success');
            } else {
                await subscribeToWeatherAlerts(locationInfo, notifyHour);
                setIsPushSubscribed(true);
                showToast(t('fc-alerts-on'), 'success');
            }
        } catch (err) {
            showToast(err.message || t('toast-something-wrong'), 'danger');
        } finally {
            setIsPushLoading(false);
        }
    };

    // Re-subscribes with the new hour: same endpoint, so the server just updates the existing row
    const handleChangeNotifyHour = async (newHour) => {
        setNotifyHour(newHour);
        if (!isPushSubscribed) {
            return;
        }

        setIsPushLoading(true);
        try {
            await subscribeToWeatherAlerts(locationInfo, newHour);
            showToast(t('fc-alerts-updated'), 'success');
        } catch (err) {
            showToast(err.message || t('toast-something-wrong'), 'danger');
        } finally {
            setIsPushLoading(false);
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
                onRemoveFavorite={handleRemoveFavorite}
                onSaveFavorites={handleSaveFavorites}
                searchCity={searchCity}
                onSearchCityChange={(value) => {
                    setSearchCity(value);
                    setSearchState('');
                }}
                searchCountry={searchCountry}
                onSearchCountryChange={setSearchCountry}
                searchState={searchState}
                onSearchStateChange={setSearchState}
                isPushSubscribed={isPushSubscribed}
                isPushLoading={isPushLoading}
                onTogglePush={handleTogglePush}
                notifyHour={notifyHour}
                onChangeNotifyHour={handleChangeNotifyHour}
                recent={recent}
                isRecentOpen={openPanel === 'recent'}
                onToggleRecent={() => togglePanel('recent')}
                onSelectRecent={handleSelectRecent}
                onClearRecent={() => setRecent(clearRecents())}
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
                    isFavorite={isFavorite(locationInfo, favorites)}
                    addToFavorites={() => {
                        if (favorites.length >= MAX_FAVORITES) {
                            showToast(t('fc-favs-full', { max: MAX_FAVORITES }), 'danger');
                            return;
                        }
                        // The server rejects the whole save for one favorite without a name or country, or with one that is too long
                        const { city, country } = locationInfo || {};
                        if (!city || !country || city.length > MAX_FAVORITE_TEXT_LENGTH || country.length > MAX_FAVORITE_TEXT_LENGTH) {
                            showToast(t('fc-favs-name-invalid'), 'danger');
                            return;
                        }
                        const updatedFavorites = [...favorites, { name: locationInfo?.city, country: locationInfo?.country, region: locationInfo?.region || undefined, latitude: locationInfo?.latitude, longitude: locationInfo?.longitude }];
                        setFavorites(updatedFavorites);
                    }}
                    removeFromFavorites={() => {
                        setFavorites(favorites.filter(fav => !isSameLocation(fav, locationInfo)));
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
                            onDetailsOpen={() => setOpenPanel(prev => (prev === 'recent' || prev === 'favorites') ? null : prev)}
                            closeDetails={openPanel === 'recent' || openPanel === 'favorites'}
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