import React, { useState } from 'react';
import './card.css'
import { formatters, getUvIndexWarning, getHumidityWaring, getWindSpeedWarning, getWindDirection, getPM10Warning, getPM2_5Warning,
    getCarbonMonoxideWarning, getNitrogenDioxideWarning, getOzoneWarning, getSulphurDioxideWarning } from './functions';

    const HourDetails = ({ hour, onClose, tempUnit }) => {
    if (!hour) return null;


    const ItemProp = 'list-item col-6 col-md-4 col-lg-12 d-flex';
    const ItemMargin = 'me-md-3 d-flex align-items-center';
    // They might need to be adjusted if the 'hour' object has different property names.
    return (   
    <> 
        <div className='h-100 hour-details '>
            <button onClick={onClose} className="btn-close btn-close-white" aria-label="Close"></button>
            <h3 className="mt-3 mb-4 mb-lg-5">{formatters.time(hour.timestamp)}</h3>
            <h4 className="mt-3 mb-3">Weather</h4>
            <ul className="list-unstyled d-flex flex-row flex-wrap justify-content-start align-items-start mb-2 mb-lg-3 mb-xl-4">
                <li className={ItemProp}><p className={ItemMargin}>temperature: {formatters.temperature(hour.temp, tempUnit)}</p></li>
                <li className={ItemProp}><p className={ItemMargin}>Feels Like: {formatters.temperature(hour.apparentTemperature, tempUnit)}</p></li>
                <li className={ItemProp}><p className={ItemMargin}>Condition: {hour.condition}</p><img src={hour.icon} alt={hour.condition} className='weather-icon-small mx-1'/></li>
                <li className={ItemProp}><p className={ItemMargin}>Humidity: {hour.humidity}%</p>{getHumidityWaring(hour.humidity)}</li>
                <li className={ItemProp}><p className={ItemMargin}>Wind Direction: {getWindDirection(hour.windDirection)}</p></li>
                <li className={ItemProp}><p className={ItemMargin}>Wind Speed: {hour.windSpeed} km/h</p>{getWindSpeedWarning(hour.windSpeed)}</li>
                <li className={ItemProp}><p className={ItemMargin}>UV Index: {hour.uvIndex}</p>{getUvIndexWarning(hour.uvIndex)}</li>
            </ul>    
            <h4 className="mt-3 mb-3">Air Quality</h4>
            <ul className="list-unstyled d-flex flex-row flex-wrap justify-content-start align-items-start">
                {!hour?.airQuality ? (
                    <li className={ItemProp}><p className={ItemMargin}>No air quality data available.</p></li>
                ) : (
                    <>
                        <li className={ItemProp}><p className={ItemMargin}>PM10: {hour.airQuality.pm10}</p>{getPM10Warning(hour.airQuality.pm10)}</li>
                        <li className={ItemProp}><p className={ItemMargin}>PM2.5: {hour.airQuality.pm2_5}</p>{getPM2_5Warning(hour.airQuality.pm2_5)}</li>
                        <li className={ItemProp}><p className={ItemMargin}>Carbon Monoxide: {hour.airQuality.carbonMonoxide}</p>{getCarbonMonoxideWarning(hour.airQuality.carbonMonoxide)}</li>
                        <li className={ItemProp}><p className={ItemMargin}>Nitrogen Dioxide: {hour.airQuality.nitrogenDioxide}</p>{getNitrogenDioxideWarning(hour.airQuality.nitrogenDioxide)}</li>
                        <li className={ItemProp}><p className={ItemMargin}>Ozone: {hour.airQuality.ozone}</p>{getOzoneWarning(hour.airQuality.ozone)}</li>
                        <li className={ItemProp}><p className={ItemMargin}>Sulphur Dioxide: {hour.airQuality.sulphurDioxide}</p>{getSulphurDioxideWarning(hour.airQuality.sulphurDioxide)}</li>
                    </>
                )}
            </ul>
        </div>
    </>
    );
};

// Individual hourly forecast card component
export const HourlyForecastCard = ({ hour, onClick, tempUnit }) => { // Added onClick
    if (!hour || !hour.time || !hour.temp || !hour.icon) {
        return <div className="p-4">No hourly weather available.</div>;
    }

    return (
        <div className='col-3 d-flex justify-content-center align-items-center' onClick={onClick}> {/* Added onClick */}
            <div className="card text-white card-daily mb-3 daily-card col-11 col-xl-9 rounded-3">
                <div className="card-body text-center py-2 px-0 d-flex flex-column justify-content-center align-items-center">
                    <h5 className="card-title mb-1">{formatters.time(hour.timestamp)}</h5>
                    <img
                        src={hour.icon}
                        alt={hour.condition}
                        className="weather-icon my-2"
                     />
                    <p className="card-text mb-0">{formatters.temperature(hour.temp, tempUnit)}</p>
                </div>
            </div>
        </div>
    );
};

export function HourlyForecast({ hourlyForecast, tempUnit, dailyForecast}) {
    if (!hourlyForecast || hourlyForecast.length === 0) {
        return <div className="p-4">No hourly forecast available.</div>;
    }

    const [selectedHour, setSelectedHour] = useState(null);

    const handleHourClick = (hour) => {
        setSelectedHour(hour);
    };

    const handleCloseDetails = () => {
        setSelectedHour(null);
    };

    const visibleCards = 4;

    // Start index to show the next 4 hours from current time
    const [startIndex, setStartIndex] = useState(() => {
        const currentHour = new Date().getHours();
        const initialIndex = hourlyForecast.findIndex(
          (hour) => new Date(hour.timestamp).getHours() > currentHour
        );
        if (initialIndex === -1) {
          return hourlyForecast.length;
        }
        return initialIndex;
    }); 

    // Handlers for next and previous buttons, it skips to the next/previous set of 4 hours
    const handleNextHours = () => {
        let i = startIndex + 1;
        while (i % 4 !== 0 && i < hourlyForecast.length) {
            i++;
        }
        const maxStart = Math.max(0, hourlyForecast.length - visibleCards);
        setStartIndex(Math.min(Math.max(i, 0), maxStart));
    };

    const handlePreviousHours = () => {
        let i = startIndex - 1;
        while (i > 0 && i % 4 !== 0) {
            i--;
        }
        setStartIndex(i);
    };

    const [touchStartX, setTouchStartX] = useState(0);
    const handleTouchStart = (e) => {
        setTouchStartX(e.touches[0].clientX);
    };

    const handleTouchEnd = (e) => {
        const touchEndX = e.changedTouches[0].clientX;
        const swipeDistance = touchStartX - touchEndX;
        const swipeThreshold = 50; // Minimum distance for a recognized swipe

        if (swipeDistance > swipeThreshold) { // Swiping left (next hours)
            handleNextHours();
        } else if (swipeDistance < -swipeThreshold) { // Swiping right (previous hours)
             handlePreviousHours();
        }
    };

   

    // Define hours to display
    const visibleHours = hourlyForecast.slice(startIndex, startIndex + visibleCards );
    if (visibleHours.length === 0) {
        return <div className="p-4">No more hourly forecast for today.</div>;
    }
    
    const currentDayTimestamp = visibleHours[0].timestamp;
    const currentDayDate = new Date(currentDayTimestamp);
    
    // Find the corresponding daily forecast
    const dailyDataForCurrentDay = dailyForecast.find(day => {
        const dayDate = new Date(day.date);
        return dayDate.getFullYear() === currentDayDate.getFullYear() &&
               dayDate.getMonth() === currentDayDate.getMonth() &&
               dayDate.getDate() === currentDayDate.getDate();
    });

    const formattedDate = `${currentDayDate.getDate()}/${currentDayDate.getMonth() + 1}/${currentDayDate.getFullYear()}`;
    
    let sunrise = null;
    let sunset = null;

    if (dailyDataForCurrentDay) {
        sunrise = formatters.time(dailyDataForCurrentDay.sunrise);
        sunset = formatters.time(dailyDataForCurrentDay.sunset);
    }


    // The hourly forecast section
    return (
        <>  
            <h2 className='mx-auto mb-2'>{formattedDate}</h2>
            {sunrise && sunset && (
                <h2 className='mx-auto mb-2'>Sunrise: {sunrise} - Sunset: {sunset}</h2>
            )}
            <section className="row d-flex flex-row justify-self-center jusify-content-between align-items-center daily-row my-3 mx-0 px-2">
                <div className='col-1 col-lg-2 d-none d-md-flex justify-content-end'>
                    <button 
                        className="btn btn-link p-0 text-white col-4"
                        disabled={startIndex === 0}
                        onClick={handlePreviousHours}>
                        <i className="bi bi-caret-left-fill" 
                        style={{ fontSize: '30px', textShadow: '2px 2px 4px rgba(0,0,0,0.5)' }}>
                        </i>
                    </button>
                
                </div>
                <div
                    className="col-12 col-md-10 col-lg-8 d-flex flex-row overflow-hidden justify-content-center align-items-center gx-5 px-0"
                    onTouchStart={handleTouchStart}
                    onTouchEnd={handleTouchEnd}
                >
                    {visibleHours.map((hour, index) => (
                        <HourlyForecastCard key={index} hour={hour} onClick={() => handleHourClick(hour)} tempUnit={tempUnit} />
                    ))}
                </div>
                <div className='col-1 col-lg-2 d-none d-md-flex justify-content-start'>
                        <button 
                            className="btn btn-link p-0 text-white col-4"
                            disabled={startIndex + visibleCards >= hourlyForecast.length}
                            onClick={handleNextHours}>
                            <i className="bi bi-caret-right-fill" 
                            style={{ fontSize: '30px', textShadow: '2px 2px 4px rgba(0,0,0,0.5)' }}>   
                            </i>
                        </button>
                </div>
            </section>
            <div className="hour-details-container">
                <HourDetails hour={selectedHour} onClose={handleCloseDetails} tempUnit={tempUnit} />
            </div>
        </>
        
    );
}

export default HourlyForecast;