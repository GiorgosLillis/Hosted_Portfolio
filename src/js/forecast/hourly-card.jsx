import React from 'react';
import './card.css'

export const HourlyForecastCard = ({ hour }) => {
    if (!hour || !hour.time || !hour.temp || !hour.icon) {
        return <div className="p-4">No hourly weather available.</div>;
    }

    return (
        <div className='col-3 d-flex justify-content-center align-items-center'>
            <div className="card text-white card-daily mb-3 daily-card col-11 col-xl-9 rounded-3">
                <div className="card-body text-center py-2 px-0 d-flex flex-column justify-content-center align-items-center">
                    <h5 className="card-title mb-1">{hour.time}</h5>
                    <img
                        src={hour.icon}
                        alt={hour.condition}
                        className="weather-icon my-2"
                     />
                    <p className="card-text mb-0">{hour.temp}°C</p>
                </div>
            </div>
        </div>
    );
};

export function HourlyForecast({ hourlyForecast}) {
    if (!hourlyForecast || hourlyForecast.length === 0) {
        return <div className="p-4">No hourly forecast available.</div>;
    }

    const visibleCards = 4;
    const [startIndex, setStartIndex] = React.useState(0);
    const [touchStartX, setTouchStartX] = React.useState(0);

    const handleTouchStart = (e) => {
        setTouchStartX(e.touches[0].clientX);
    };

    const handleTouchEnd = (e) => {
        const touchEndX = e.changedTouches[0].clientX;
        const swipeDistance = touchStartX - touchEndX;
        const swipeThreshold = 50; // Minimum distance for a recognized swipe

        if (swipeDistance > swipeThreshold) { // Swiping left (next hours)
            setStartIndex(prevIndex => Math.min(prevIndex + visibleCards, hourlyForecast.length - visibleCards));
        } else if (swipeDistance < -swipeThreshold) { // Swiping right (previous hours)
            setStartIndex(prevIndex => Math.max(0, prevIndex - visibleCards));
        }
    };

    const handleNextHours = () => {
        setStartIndex(prevIndex => Math.min(prevIndex + visibleCards, hourlyForecast.length - visibleCards));
    };

    const handlePreviousHours = () => {
        setStartIndex(prevIndex => Math.max(0, prevIndex - visibleCards));
    };

    const visibleHours = hourlyForecast.slice(startIndex, startIndex + visibleCards );
    const currentDayDate = new Date(hourlyForecast[startIndex].timestamp);
    const formattedDate = `${currentDayDate.getDate()}/${currentDayDate.getMonth() + 1}/${currentDayDate.getFullYear()}`;

    return (
        <>  
            <h2 className='mx-auto'>{formattedDate}</h2>
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
                    className="col-12 col-md-10 col-lg-8 d-flex flex-row overflow-hidden justify-content-center align-items-center gx-5"
                    onTouchStart={handleTouchStart}
                    onTouchEnd={handleTouchEnd}
                >
                    {visibleHours.map((hour, index) => (
                        <HourlyForecastCard key={index} hour={hour} />
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
        </>
        
    );
}

export default HourlyForecast;