import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';

// Import the components from the new file.
import {LoadingIndicator, ErrorMessage, setBackgroundImage, isFavorite, addToFavorites, removeFromFavorites } from './functions.jsx';
import CurrentWeather from './current-weather.jsx';
import { fetchWeather, getLocation, getCachedWeather, getCityLocation} from '../weather/weather-api.js';
import WeatherForecast  from './daily-card.jsx';
import ViewToggle from './view-toggle.jsx';
import  HourlyForecast  from './hourly-card.jsx';
import  './search.jsx';
import  './favorite.jsx';

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
    const [search, setSearch] = useState(null);
    const [selectedFav, setSelectedFav] = useState(null);
    const [favorites, setFavorites] = useState([]);


    useEffect(() => {
        const storedFavorites = JSON.parse(localStorage.getItem('favoriteLocations')) || [];
        setFavorites(storedFavorites);
    }, []);

    useEffect(() => {
        const handleCitySearch = (event) => {
            setSearch(event.detail);
        };

        document.addEventListener('citySearch', handleCitySearch);

        return () => {
            document.removeEventListener('citySearch', handleCitySearch);
        };
    }, []);

    useEffect(() => {
        const favCitySearch = (event) => {
            setSelectedFav(event.detail);
        };

        document.addEventListener('favSearch', favCitySearch);

        return () => {
            document.removeEventListener('favSearch', favCitySearch);
        };
    }, []);

    const fetchWeatherDataForCity = async (city, country) => {
        try {
            setError(null);
            setWarning(null);
         
            const location = await getCityLocation(city, country);
            if (!location) {
                throw new Error("Unable to retrieve location for the specified city");
            }

            const weatherData = await fetchWeather(location);
            if (!weatherData) {
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

    useEffect(() => {
      
        if (search) {   
            setLoading(true);
            if (search.city === '' && search.country === '') {
                setWarning("Search fields are empty. Showing your current location.");
                initializeWeather();
            } else if (search.city === '') {
                setWarning("City field is empty. Cannot search only by country. Showing your current location.");
                initializeWeather(); 
            } else {
                fetchWeatherDataForCity(search.city, search.country);
            }
            setSearch(null);
        } else if(selectedFav) { 
                setLoading(true);
            if (selectedFav.city === '' && selectedFav.country === '') {
                setWarning("Favorite button is empty. Showing your current location.");
                initializeWeather();
            } else if (selectedFav.city === '') {
                setWarning("Favorite city is empty. Cannot search only by country. Showing your current location.");
                initializeWeather(); 
            } else {
                fetchWeatherDataForCity(selectedFav.city , selectedFav.city ); // Will need the coords of the favorite city
            }
            setSelectedFav(null);
        }
        else{
           initializeWeather(); 
        } 
    }, [search, selectedFav]);

    const initializeWeather = async () => {
            try {
                    setError(null);

                    let location;
                    location = await getLocation();
                    if (!location){
                        throw new Error("Unable to retrieve location");
                    }

                    // Fetch weather data from API
                    const cachedWeather = getCachedWeather();
                    if (cachedWeather){
                        console.log('Weather data is fresh, using from localStorage');
                        setLocationInfo(location);
                        setWeatherData(cachedWeather);
                        setLastUpdate(new Date(cachedWeather.time));
                        return;
                    }
                    
                    const weatherData = await fetchWeather(location);
                    if (!weatherData) {
                        throw new Error("Unable to fetch weather data");
                    }

                    // Assume data contains { weatherData, locationInfo, time }
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
        <CurrentWeather
            warning={warning}
            error={error}
            locationInfo={locationInfo}
            weatherData={weatherData}
            lastUpdate={lastUpdate}
            Unit={Unit}
            setUnit={setUnit}
            isFavorite={isFavorite(locationInfo?.city, locationInfo?.country, favorites,  setFavorites)}
            addToFavorites={() => addToFavorites({city: locationInfo?.city, country: locationInfo?.country}, favorites, setFavorites)}
            removeFromFavorites={() => removeFromFavorites({city: locationInfo?.city, country: locationInfo?.country}, favorites,  setFavorites)}
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
    console.error('Root container not found in the DOM.');
  }
});