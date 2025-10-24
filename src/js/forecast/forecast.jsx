import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';

// Import the components from the new file.
import {LoadingIndicator, ErrorMessage, setBackgroundImage, isFavorite, WarningMessage} from './functions.jsx';
import CurrentWeather from './current-weather.jsx';
import { fetchWeather, getLocation, getCachedWeather, getCityLocation} from '../weather/weather-api.js';
import WeatherForecast  from './daily-card.jsx';
import ViewToggle from './view-toggle.jsx';
import  HourlyForecast  from './hourly-card.jsx';
import Header from './search.jsx';
import { saveCityList, loadCityList } from './memory-handle.js';

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
    const [openPanel, setOpenPanel] = useState(null); // null, 'search', or 'favorites'
    const [searchCity, setSearchCity] = useState('');
    const [searchCountry, setSearchCountry] = useState('');


    useEffect(() => {
        const initializeFavorites = async () => {
            const list = await loadCityList();
            setFavorites(list);
        };
        initializeFavorites();
    }, []);

    useEffect(() => {
        console.log("No search or favorite selected, initializing weather for current location");
        initializeWeather();
    }, []);

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
            if(cachedWeather !== null){
                weatherData = cachedWeather;
            }
            else{
                weatherData = await fetchWeather(location);
            }
            if (!weatherData){
                throw new Error("Unable to fetch weather data");
            }
            setLocationInfo(location);
            setWeatherData(weatherData);
            setLastUpdate(new Date(weatherData.time));

            if(!country){
                setWarning("No country specified. Picked the most common result.");
            }
            else if(weatherData.country != country){
                setWarning("This city has not been found in this country! Picked the most common result.");
            }
        } catch (err) {
            console.error("Weather fetch for city failed:", err);
            setError(err.message || "Failed to fetch weather data for the city");
        } finally {
            setLoading(false);
        }
    };

    const initializeWeather = async () => {
            try {
                    setError(null);
                    setWarning(null);
                    setLoading(true);

                    let location;
                    location = await getLocation();
                    if (!location){
                        throw new Error("Unable to retrieve location");
                    }

                    let weatherData;
                    const cachedWeather = getCachedWeather();
                    if(cachedWeather !== null){
                        weatherData = cachedWeather;
                    }
                    else{
                        weatherData = await fetchWeather(location);
                    }
                    if (!weatherData){
                        throw new Error("Unable to fetch weather data");
                    }
                    setLocationInfo(location);
                    setWeatherData(weatherData);
                    setLastUpdate(new Date(weatherData.time));
                    

            } catch (err) {
                    console.error("Weather initialization failed:", err);
                    setError(err.message || "Failed to fetch weather data");
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

    useEffect(() => {
        const handleSave = async () => {
            await saveCityList(favorites);
        };

        document.addEventListener('saveFavorites', handleSave);

        return () => {
            document.removeEventListener('saveFavorites', handleSave);
        };
    }, [favorites]);

    const handleDayClick = (day) => {
        const selectedDay = new Date(day.date).getDate();
        const hourlyForSelectedDay = weatherData.hourly.filter(hour => {
            const hourDay = new Date(hour.timestamp).getDate();
            return hourDay === selectedDay;
        });
        setSelectedDayHourly(hourlyForSelectedDay);
        setSelectedDate(new Date(day.date));
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

    const handleSearch = async (city, country) => {
        setOpenPanel(null); // Close panel immediately
        await fetchWeatherDataForCity({ name: city, country: country });
    };

    const handleSearchIconClick = () => {
        if (openPanel === 'search') {
            if (searchCity === '' && searchCountry === '') {
                setWarning("Search fields are empty. Showing your current location.");
                initializeWeather();
            } else if (searchCity === '') {
                setWarning("City field is empty. Cannot search only by country. Showing your current location.");
                initializeWeather();
            } else {
                handleSearch(searchCity, searchCountry);
            }
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

    if (!weatherData) {
        return (
            <div className="text-danger text-center fs-3">
                No weather data available
            </div>
        );
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
        </>
    );
}

// Mount the React component
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