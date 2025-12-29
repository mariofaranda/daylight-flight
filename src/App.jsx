import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import './App.css'
import SunCalc from 'suncalc'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

function App() {
  const canvasRef = useRef(null)
  const [currentTime, setCurrentTime] = useState(new Date())
  const [simulatedTime, setSimulatedTime] = useState(new Date())
  const [departureCode, setDepartureCode] = useState('')
  const [arrivalCode, setArrivalCode] = useState('')
  const [airports, setAirports] = useState(null)
  const [flightPath, setFlightPath] = useState(null)
  
  // Store scene reference to add/remove flight path
  const sceneRef = useRef(null)
  const flightLineRef = useRef(null)

  useEffect(() => {
    if (!canvasRef.current) return

    // Load airport data from OpenFlights
    fetch('https://raw.githubusercontent.com/jpatokal/openflights/master/data/airports.dat')
    .then(res => res.text())
    .then(data => {
      // Parse CSV format
      const lines = data.split('\n')
      const airportMap = {}
      
      lines.forEach(line => {
        const parts = line.split(',').map(s => s.replace(/"/g, ''))
        if (parts.length >= 8) {
          const iata = parts[4]  // IATA code
          const name = parts[1]
          const city = parts[2]
          const lat = parseFloat(parts[6])
          const lon = parseFloat(parts[7])
          
          // Only include airports with valid IATA codes
          if (iata && iata !== '\\N' && iata.length === 3) {
            airportMap[iata] = { name, city, lat, lon }
          }
        }
      })
      
      setAirports(airportMap)
      console.log('Loaded airports:', Object.keys(airportMap).length)
    })
    .catch(err => console.error('Error loading airports:', err))

    // 1. Create the scene
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xe8e6e3) // warm light gray
    sceneRef.current = scene  // Store scene reference

    // 2. Create the camera
    const camera = new THREE.PerspectiveCamera(
      75,  // field of view
      window.innerWidth / window.innerHeight,  // aspect ratio
      0.1,  // near clipping plane
      1000  // far clipping plane
    )
    camera.position.z = 5  // move camera back so we can see the sphere

    // 3. Create the renderer
    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current,
      antialias: true  // smooth edges
    })
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.localClippingEnabled = true  // Enable clipping

    // Add orbit controls for mouse interaction
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true  // Smooth motion
    controls.dampingFactor = 0.05
    controls.minDistance = 3  // How close you can zoom
    controls.maxDistance = 10  // How far you can zoom
    controls.enablePan = false  // Disable panning

    // 4. Create a sphere (our Earth)
    const geometry = new THREE.SphereGeometry(2, 64, 64)

    // Load simplified Earth texture
    const textureLoader = new THREE.TextureLoader()
    const earthTexture = textureLoader.load(
      '/earth-texture.png',  // Your custom texture
      () => console.log('Earth texture loaded'),
      undefined,
      (error) => console.error('Error loading texture:', error)
    )

    const material = new THREE.MeshStandardMaterial({
      map: earthTexture,
      roughness: 0.9,
      metalness: 0.0
    })

    const sphere = new THREE.Mesh(geometry, material)
    scene.add(sphere)

    // Add a marker at user location
    const dotGeometry = new THREE.SphereGeometry(0.02, 8, 8)
    const dotMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x27A3F5,
      emissive: 0x27A3F5,
      emissiveIntensity: 1,
      roughness: 0.5,
      metalness: 0.5
    })
    const dot = new THREE.Mesh(dotGeometry, dotMaterial)

    // Function to position dot based on lat/lon
    function positionDotAtLocation(lat, lon) {
      const phi = (90 - lat) * (Math.PI / 180)
      const theta = (lon + 180) * (Math.PI / 180)
      const radius = 2
      
      dot.position.x = -radius * Math.sin(phi) * Math.cos(theta)
      dot.position.y = radius * Math.cos(phi)
      dot.position.z = radius * Math.sin(phi) * Math.sin(theta)
    }

    // Try to get user's location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const userLat = position.coords.latitude
          const userLon = position.coords.longitude
          console.log('Your location:', userLat, userLon)
          positionDotAtLocation(userLat, userLon)
        },
        (error) => {
          console.log('Geolocation error, defaulting to Milan:', error.message)
          positionDotAtLocation(45.464, 9.190)
        }
      )
    } else {
      console.log('Geolocation not supported, defaulting to Milan')
      positionDotAtLocation(45.464, 9.190)
    }

    sphere.add(dot)

    // Calculate initial sun position
    const initialTime = new Date()
    
    // Get subsolar point (where sun is directly overhead)
    const times = SunCalc.getTimes(initialTime, 0, 0)
    const solarNoon = times.solarNoon
    const hoursSinceNoon = (initialTime - solarNoon) / (1000 * 60 * 60)
    const subsolarLongitude = hoursSinceNoon * 15 // 15° per hour

    // Solar declination (latitude where sun is overhead)
    const dayOfYear = Math.floor((initialTime - new Date(initialTime.getFullYear(), 0, 0)) / 86400000)
    const subsolarLatitude = -23.44 * Math.cos((2 * Math.PI / 365) * (dayOfYear + 10))

    // Convert subsolar point to 3D direction
    const phi = (90 - subsolarLatitude) * (Math.PI / 180)
    const theta = (subsolarLongitude + 180) * (Math.PI / 180)

    const sunDirection = new THREE.Vector3(
      -Math.sin(phi) * Math.cos(theta),
      Math.cos(phi),
      Math.sin(phi) * Math.sin(theta)
    )

    console.log('Initial subsolar point:', subsolarLatitude.toFixed(2), '°N,', subsolarLongitude.toFixed(2), '°E')

    // Add ambient light (soft overall illumination)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.3)
    scene.add(ambientLight)

    // Add directional light positioned as the sun
    const sunLight = new THREE.DirectionalLight(0xffffff, 1.2)
    sunLight.position.copy(sunDirection.clone().multiplyScalar(10))
    scene.add(sunLight)

    // Create the night hemisphere overlay
    const clipPlane = new THREE.Plane(sunDirection.clone().negate(), 0)
    const nightGeometry = new THREE.SphereGeometry(2.003, 64, 64)
    const nightMaterial = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.4,
      side: THREE.FrontSide,
      clippingPlanes: [clipPlane],
      clipIntersection: false
    })
    const nightSphere = new THREE.Mesh(nightGeometry, nightMaterial)
    scene.add(nightSphere)

    // Store references for updating
    const sceneRefs = {
      sunLight,
      clipPlane,
      nightMaterial
    }

    // Store the start time when the app loads
    const startTime = Date.now()

    function updateSunPosition() {
      // Calculate elapsed time since start
      const elapsed = Date.now() - startTime
      
      // Real-time (1x speed)
      const acceleratedTime = startTime + (elapsed * 1)
      const currentTime = new Date(acceleratedTime)
      
      // Get subsolar point
      const times = SunCalc.getTimes(currentTime, 0, 0)
      const solarNoon = times.solarNoon
      const hoursSinceNoon = (currentTime - solarNoon) / (1000 * 60 * 60)
      const subsolarLongitude = hoursSinceNoon * 15

      // Solar declination
      const dayOfYear = Math.floor((currentTime - new Date(currentTime.getFullYear(), 0, 0)) / 86400000)
      const subsolarLatitude = -23.44 * Math.cos((2 * Math.PI / 365) * (dayOfYear + 10))

      // Convert subsolar point to 3D direction
      const phi = (90 - subsolarLatitude) * (Math.PI / 180)
      const theta = (subsolarLongitude + 180) * (Math.PI / 180)

      const sunDirection = new THREE.Vector3(
        -Math.sin(phi) * Math.cos(theta),
        Math.cos(phi),
        Math.sin(phi) * Math.sin(theta)
      )
      
      // Update light position
      sceneRefs.sunLight.position.copy(sunDirection.clone().multiplyScalar(10))
      
      // Update clipping plane
      sceneRefs.clipPlane.normal.copy(sunDirection.clone().negate())
    }

    // 5. Animation loop
    function animate() {
      requestAnimationFrame(animate)
      
      // Pulsate the dot brightness
      const time = Date.now() * 0.002
      const intensity = 0.5 + Math.sin(time) * 0.5
      dotMaterial.emissiveIntensity = intensity

      // Update time displays
      setCurrentTime(new Date())  // Real time
      const elapsed = Date.now() - startTime
      const acceleratedTime = startTime + (elapsed * 1)  // Real-time
      setSimulatedTime(new Date(acceleratedTime))  // Simulated time

      // Update sun position
      updateSunPosition()
      
      controls.update()
      renderer.render(scene, camera)
    }
    
    animate()

    // 6. Handle window resize
    function handleResize() {
      camera.aspect = window.innerWidth / window.innerHeight
      camera.updateProjectionMatrix()
      renderer.setSize(window.innerWidth, window.innerHeight)
    }
    
    window.addEventListener('resize', handleResize)

    // 7. Cleanup
    return () => {
      window.removeEventListener('resize', handleResize)
      renderer.dispose()
    }
  }, [])

    // Effect to draw flight path when flightPath state changes
  useEffect(() => {
    if (!flightPath || !sceneRef.current) return

    // Remove previous flight path if exists
    if (flightLineRef.current) {
      sceneRef.current.remove(flightLineRef.current)
      flightLineRef.current.geometry.dispose()
      flightLineRef.current.material.dispose()
    }

    const { departure, arrival } = flightPath

    // Helper function to convert lat/lon to 3D vector
    const latLonToVector3 = (lat, lon, radius) => {
      const phi = (90 - lat) * (Math.PI / 180)
      const theta = (lon + 180) * (Math.PI / 180)
      
      return new THREE.Vector3(
        -radius * Math.sin(phi) * Math.cos(theta),
        radius * Math.cos(phi),
        radius * Math.sin(phi) * Math.sin(theta)
      )
    }

    // Calculate great circle path using proper spherical interpolation
    const points = []
    const numPoints = 100
    const radius = 2.01

    // Get start and end points as 3D vectors
    const start = latLonToVector3(departure.lat, departure.lon, 1) // Unit sphere
    const end = latLonToVector3(arrival.lat, arrival.lon, 1)

    // Calculate angle between vectors
    const angle = start.angleTo(end)

    for (let i = 0; i <= numPoints; i++) {
      const fraction = i / numPoints
      
      // Spherical linear interpolation (Slerp)
      const point = new THREE.Vector3()
      
      if (angle === 0) {
        // Same point
        point.copy(start)
      } else {
        const sinAngle = Math.sin(angle)
        const a = Math.sin((1 - fraction) * angle) / sinAngle
        const b = Math.sin(fraction * angle) / sinAngle
        
        point.x = a * start.x + b * end.x
        point.y = a * start.y + b * end.y
        point.z = a * start.z + b * end.z
      }
      
      // Scale to Earth radius + altitude
      point.normalize().multiplyScalar(radius)
      points.push(point)
    }

    // Create the line
    const lineGeometry = new THREE.BufferGeometry().setFromPoints(points)
    const lineMaterial = new THREE.LineBasicMaterial({ 
      color: 0xff0000,
      linewidth: 2
    })
    const line = new THREE.Line(lineGeometry, lineMaterial)
    
    sceneRef.current.add(line)
    flightLineRef.current = line

    console.log('Great circle path drawn with', points.length, 'points')
  }, [flightPath])

  const calculateFlight = () => {
    if (!airports) {
      console.log('Airports not loaded yet')
      return
    }
    
    const departure = airports[departureCode]
    const arrival = airports[arrivalCode]
    
    if (!departure) {
      console.log('Departure airport not found:', departureCode)
      return
    }
    
    if (!arrival) {
      console.log('Arrival airport not found:', arrivalCode)
      return
    }
    
    console.log('Flight from', departure.city, 'to', arrival.city)
    console.log('Departure:', departure.lat, departure.lon)
    console.log('Arrival:', arrival.lat, arrival.lon)
    
    // Trigger flight path drawing
    setFlightPath({ departure, arrival })
  }

  return (
    <div className="app">
      <div className="info-overlay">
        <div className="time">{simulatedTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
        <div className="date">{simulatedTime.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}</div>
      </div>
      
      <div className="flight-input">
        <h3>Flight Path</h3>
        <div className="input-group">
          <label>Departure</label>
          <input 
            type="text" 
            placeholder="JFK"
            maxLength="3"
            value={departureCode}
            onChange={(e) => setDepartureCode(e.target.value.toUpperCase())}
          />
        </div>
        <div className="input-group">
          <label>Arrival</label>
          <input 
            type="text" 
            placeholder="NRT"
            maxLength="3"
            value={arrivalCode}
            onChange={(e) => setArrivalCode(e.target.value.toUpperCase())}
          />
        </div>
        <button 
          onClick={calculateFlight}
          disabled={!airports || departureCode.length !== 3 || arrivalCode.length !== 3}
        >
          {!airports ? 'Loading airports...' : 'Calculate Flight'}
        </button>
      </div>
      
      <canvas ref={canvasRef} />
    </div>
  )
}

export default App