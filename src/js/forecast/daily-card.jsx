import React from 'react';
import './card.css'
import { formatters } from './functions';


// Individual daily forecast card component
export const DailyForecastCard = ({ day, onClick, Unit }) => {
    if (!day || !day.date || !day.tempMax || !day.tempMin) {
        return <div className="p-4">No daily weather available.</div>;
    }
    // Format the date as "DD//MM"
    const date = new Date(day.date);
    let Day = date.getDate();
    let month = date.getMonth() + 1;
    let formattedDate = `${Day}/${month}`;

    return (
        <div className='col-3 d-flex justify-content-center align-items-center' onClick={onClick} aria-label='Press for more daily weather details'>
            <div className="card text-white card-daily mb-3 daily-card col-11 col-xl-9 rounded-3">
                <div className="card-body text-center py-2 px-0 d-flex flex-column justify-content-center align-items-center">
                    <h4 className="card-title mb-1">{formattedDate}</h4>
                    <img
                        src={day.icon}
                        alt={day.condition}
                        className="weather-icon my-2"
                     />
                    <div className='d-flex flex-column flex-md-row justify-content-around align-items-center mt-1 w-100'> 
                        <p className="card-text mb-0">{formatters.temperature(day.tempMin, Unit)}</p>
                        <p className="card-text mb-0">{formatters.temperature(day.tempMax, Unit)}</p>
                    </div>   

                </div>
            </div>
        </div>
    );
};

export function WeatherForecast({ dailyForecast, onDayClick, Unit }) {
    if (!dailyForecast || dailyForecast.length === 0) {
        return <div className="p-4">No daily forecast available.</div>;
    }
    
    let visibleCards = 4;
    // Show up to 4 days starting from a given index (default 0)
    const [startIndex, setStartIndex] = React.useState(0);
    const [touchStartX, setTouchStartX] = React.useState(0);

    const handleTouchStart = (e) => {
        setTouchStartX(e.touches[0].clientX);
    };

    const handleTouchEnd = (e) => {
        const touchEndX = e.changedTouches[0].clientX;
        const swipeDistance = touchStartX - touchEndX;
        const swipeThreshold = 50; // Minimum distance for a recognized swipe

        if (swipeDistance > swipeThreshold && startIndex + visibleCards < dailyForecast.length) {
            setStartIndex(startIndex + 1);
        } else if (swipeDistance < -swipeThreshold && startIndex > 0) {
            setStartIndex(startIndex - 1);
        }
    };

    // Determine the days to display
    const visibleDays = dailyForecast.slice(startIndex, startIndex + visibleCards );

    // Display weeek range as "DD/MM/YYYY - DD/MM/YYYY"
    const firstDayOfWeek = new Date(dailyForecast[0].date); // First day as refernce
    const lastDayOfWeek = new Date(dailyForecast[dailyForecast.length - 1].date); // Last day as refernce
    const WeekStart = `${firstDayOfWeek.getDate().toString()}/${(firstDayOfWeek.getMonth() + 1).toString()}/${firstDayOfWeek.getFullYear().toString()}`;
    const WeekEnd = `${lastDayOfWeek.getDate().toString()}/${(lastDayOfWeek.getMonth() + 1).toString()}/${lastDayOfWeek.getFullYear().toString()}`;
    const formattedWeekRange = `${WeekStart} - ${WeekEnd}`;
   

    // The daily forecast section
    return (
        <>
            <h2 className='mx-auto mb-0'>{formattedWeekRange}</h2>
            <section className="row d-flex flex-row justify-self-center jusify-content-between align-items-center daily-row my-3 mx-0 px-2">
                <div className='col-1 col-lg-2 d-none d-md-flex justify-content-end'>
                    <button 
                        className="btn btn-link p-0 text-white col-4"
                        disabled={startIndex == 0}
                        onClick={() => setStartIndex(startIndex - 1)} 
                        aria-label = "Previous hours">
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
                    {visibleDays.map((day, index) => (
                        <DailyForecastCard key={index} day={day} onClick={() => onDayClick(day)} Unit={Unit} />
                    ))}
                </div>
                {/* Example controls to change starting day */}
                <div className='col-1 col-lg-2 d-none d-md-flex justify-content-start'>
                    <button 
                        className="btn btn-link p-0 text-white col-4"
                        disabled={startIndex + visibleCards >= dailyForecast.length}
                        onClick={() => setStartIndex(startIndex + 1)}
                        aria-label = "Next hours">
                        <i className="bi bi-caret-right-fill" 
                            style={{ fontSize: '30px', textShadow: '2px 2px 4px rgba(0,0,0,0.5)' }}>   
                        </i>
                    </button>
                </div>
            </section>
        </>
    );
}

// Export the main component as default
export default WeatherForecast;