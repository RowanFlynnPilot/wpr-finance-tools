import React from 'react'
import ReactDOM from 'react-dom/client'
import TrueCostCalculator from './TrueCostCalculator.jsx'
import RentVsBuyCalculator from './RentVsBuyCalculator.jsx'
import './truecost.css'

// One bundle, two tools: the WordPress iframe picks with ?tool=rentvsbuy.
const rentVsBuy = new URLSearchParams(window.location.search).get('tool') === 'rentvsbuy'
if (rentVsBuy) document.title = 'Rent or Buy in Marathon County? — WPR Homebuyer Tools'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>{rentVsBuy ? <RentVsBuyCalculator /> : <TrueCostCalculator />}</React.StrictMode>,
)
