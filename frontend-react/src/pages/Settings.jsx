import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useServer } from '../ServerContext'
import '../styles/settings.css'



export default function Settings() {

  const navigate = useNavigate()

  const { API_BASE } = useServer()

  const [activeTab, setActiveTab] = useState('profile')

  const [loading, setLoading] = useState(false)

  const [message, setMessage] = useState({ type: '', text: '' })



  // Profile settings state

  const [profile, setProfile] = useState({

    name: '',

    username: '',

    email: '',

    profileImage: ''

  })



  // Notification settings state

  const [notifications, setNotifications] = useState({

    emailNotifications: true,

    pushNotifications: true,

    newReleases: true,

    playlistUpdates: true,

    socialActivity: false,

    marketingEmails: false

  })



  // Playback settings state

  const [playback, setPlayback] = useState({

    crossfade: false,

    gaplessPlayback: true,

    autoPlay: true,

    streamingQuality: 'high',

    downloadQuality: 'high',

    normalizeVolume: true,

    voiceAssistantEnabled: false

  })





  // Account settings state

  const [account, setAccount] = useState({

    currentPassword: '',

    newPassword: '',

    confirmPassword: '',

    twoFactorEnabled: false

  })



  // Language and region

  const [preferences, setPreferences] = useState({

    language: 'en',

    region: 'US',

    theme: 'dark'

  })



  const tabs = [

    { id: 'profile', label: 'Profile', icon: 'fa-user' },

    { id: 'notifications', label: 'Notifications', icon: 'fa-bell' },

    { id: 'playback', label: 'Playback', icon: 'fa-music' },

    { id: 'account', label: 'Account', icon: 'fa-lock' },

    { id: 'preferences', label: 'Preferences', icon: 'fa-gear' }

  ]



  const streamingQualities = [

    { value: 'low', label: 'Low (24 kbps)' },

    { value: 'normal', label: 'Normal (96 kbps)' },

    { value: 'high', label: 'High (160 kbps)' },

    { value: 'very_high', label: 'Very High (320 kbps)' }

  ]



  const languages = [

    { value: 'en', label: 'English' },

    { value: 'es', label: 'Español' },

    { value: 'fr', label: 'Français' },

    { value: 'de', label: 'Deutsch' },

    { value: 'ja', label: '日本語' },

    { value: 'ko', label: '한국어' },

    { value: 'zh', label: '中文' }

  ]



  const regions = [

    { value: 'US', label: 'United States' },

    { value: 'GB', label: 'United Kingdom' },

    { value: 'CA', label: 'Canada' },

    { value: 'AU', label: 'Australia' },

    { value: 'DE', label: 'Germany' },

    { value: 'FR', label: 'France' },

    { value: 'JP', label: 'Japan' }

  ]



  // Load user data on mount

  useEffect(() => {

    loadUserData()

  }, [])



  const loadUserData = async () => {

    const token = localStorage.getItem('music_auth_token')

    if (!token) {

      navigate('/login')

      return

    }



    try {

      // Load profile and settings in parallel

      const [profileRes, notificationsRes, playbackRes, preferencesRes] = await Promise.all([

        fetch(`${API_BASE}/settings/profile`, {

            headers: { 'Authorization': `Bearer ${token}` }

        }),

        fetch(`${API_BASE}/settings/notifications`, {

          headers: { 'Authorization': `Bearer ${token}` }

        }),

        fetch(`${API_BASE}/settings/playback`, {

          headers: { 'Authorization': `Bearer ${token}` }

        }),

        fetch(`${API_BASE}/settings/preferences`, {

          headers: { 'Authorization': `Bearer ${token}` }

        })

      ])



      if (profileRes.ok) {

        const data = await profileRes.json()

        setProfile({

          name: data.name || '',

          username: data.username || '',

          email: data.email || '',

          profileImage: data.profile_image || ''

        })

        setAccount(prev => ({ ...prev, twoFactorEnabled: data.two_factor_enabled || false }))

      }



      if (notificationsRes.ok) {

        const data = await notificationsRes.json()

        setNotifications({

          emailNotifications: data.email_notifications,

          pushNotifications: data.push_notifications,

          newReleases: data.new_releases,

          playlistUpdates: data.playlist_updates,

          socialActivity: data.social_activity,

          marketingEmails: data.marketing_emails

        })

      }



      if (playbackRes.ok) {

        const data = await playbackRes.json()

      const savedVoiceAssistant = localStorage.getItem('leoVoiceAssistantEnabled') === 'true'

        setPlayback({

          crossfade: data.crossfade,

          gaplessPlayback: data.gapless_playback,

          autoPlay: data.auto_play,

          streamingQuality: data.streaming_quality,

          downloadQuality: data.download_quality,

          normalizeVolume: data.normalize_volume,

        voiceAssistantEnabled: savedVoiceAssistant

        })

      }



      if (preferencesRes.ok) {

        const data = await preferencesRes.json()

        setPreferences({

          language: data.language,

          region: data.region,

          theme: data.theme

        })

        // Apply theme immediately

        document.documentElement.setAttribute('data-theme', data.theme)

      }

    } catch (err) {

      console.error('Failed to load user data:', err)

    }

  }



  const showMessage = (type, text) => {

    setMessage({ type, text })

    setTimeout(() => setMessage({ type: '', text: '' }), 3000)

  }



  const handleProfileSave = async (e) => {

    e.preventDefault()

    setLoading(true)



    try {

      const token = localStorage.getItem('music_auth_token')

      const res = await fetch(`${API_BASE}/settings/profile`, {

        method: 'PUT',

        headers: {

          'Content-Type': 'application/json',

          'Authorization': `Bearer ${token}`

        },

        body: JSON.stringify({

          name: profile.name,

          username: profile.username

        })

      })



      if (!res.ok) {
        const errorText = await res.text()

        let errorMessage = `Failed to update profile (${res.status})`

        if (errorText) {
          try {
            const data = JSON.parse(errorText)
            errorMessage = data.detail || errorMessage
          } catch {
            errorMessage = errorText
          }
      }

      throw new Error(errorMessage)
      }



      showMessage('success', 'Profile updated successfully!')

    } catch (err) {

      showMessage('error', err.message || 'Failed to update profile')

    } finally {

      setLoading(false)

    }

  }



  const handleNotificationsSave = async (e) => {

    e.preventDefault()

    setLoading(true)



    try {

      const token = localStorage.getItem('music_auth_token')

      const res = await fetch(`${API_BASE}/settings/notifications`, {

        method: 'PUT',

        headers: {

          'Content-Type': 'application/json',

          'Authorization': `Bearer ${token}`

        },

        body: JSON.stringify({

          email_notifications: notifications.emailNotifications,

          push_notifications: notifications.pushNotifications,

          new_releases: notifications.newReleases,

          playlist_updates: notifications.playlistUpdates,

          social_activity: notifications.socialActivity,

          marketing_emails: notifications.marketingEmails

        })

      })



      if (!res.ok) {

        const data = await res.json()

        throw new Error(data.detail || 'Failed to save notification settings')

      }



      showMessage('success', 'Notification settings saved!')

    } catch (err) {

      showMessage('error', err.message || 'Failed to save notification settings')

    } finally {

      setLoading(false)

    }

  }



  const handleVoiceAssistantToggle = (enabled) => {
    setPlayback(prev => ({ ...prev, voiceAssistantEnabled: enabled }))
    localStorage.setItem('leoVoiceAssistantEnabled', String(enabled))
  }


  const handlePlaybackSave = async (e) => {

    e.preventDefault()

    setLoading(true)



    try {

      const token = localStorage.getItem('music_auth_token')

      const res = await fetch(`${API_BASE}/settings/playback`, {

        method: 'PUT',

        headers: {

          'Content-Type': 'application/json',

          'Authorization': `Bearer ${token}`

        },

        body: JSON.stringify({

          crossfade: playback.crossfade,

          gapless_playback: playback.gaplessPlayback,

          auto_play: playback.autoPlay,

          streaming_quality: playback.streamingQuality,

          download_quality: playback.downloadQuality,

          normalize_volume: playback.normalizeVolume

        })

      })



      if (!res.ok) {

        const data = await res.json().catch(() => ({}))

        throw new Error(data.detail || `Failed to save playback settings (HTTP ${res.status})`)

      }



      showMessage('success', 'Playback settings saved!')

    } catch (err) {

      showMessage('error', err.message || 'Failed to save playback settings')

    } finally {

      setLoading(false)

    }

  }



  const handlePasswordChange = async (e) => {

    e.preventDefault()



    if (account.newPassword !== account.confirmPassword) {

      showMessage('error', 'Passwords do not match')

      return

    }



    if (account.newPassword.length < 8) {

      showMessage('error', 'Password must be at least 8 characters')

      return

    }



    setLoading(true)



    try {

      const token = localStorage.getItem('music_auth_token')

      const res = await fetch(`${API_BASE}/settings/password`, {

        method: 'PUT',

        headers: {

          'Content-Type': 'application/json',

          'Authorization': `Bearer ${token}`

        },

        body: JSON.stringify({

          current_password: account.currentPassword,

          new_password: account.newPassword

        })

      })



      if (!res.ok) {

        const data = await res.json()

        throw new Error(data.detail || 'Failed to change password')

      }



      showMessage('success', 'Password changed successfully!')

      setAccount(prev => ({ ...prev, currentPassword: '', newPassword: '', confirmPassword: '' }))

    } catch (err) {

      showMessage('error', err.message || 'Failed to change password')

    } finally {

      setLoading(false)

    }

  }



  const handlePreferencesSave = async (e) => {

    e.preventDefault()

    setLoading(true)



    try {

      const token = localStorage.getItem('music_auth_token')

      const res = await fetch(`${API_BASE}/settings/preferences`, {

        method: 'PUT',

        headers: {

          'Content-Type': 'application/json',

          'Authorization': `Bearer ${token}`

        },

        body: JSON.stringify({

          language: preferences.language,

          region: preferences.region,

          theme: preferences.theme

        })

      })



      if (!res.ok) {

        const data = await res.json()

        throw new Error(data.detail || 'Failed to save preferences')

      }



      // Apply theme change immediately

      document.documentElement.setAttribute('data-theme', preferences.theme)

      showMessage('success', 'Preferences saved!')

    } catch (err) {

      showMessage('error', err.message || 'Failed to save preferences')

    } finally {

      setLoading(false)

    }

  }



  const handleLogout = () => {

    localStorage.removeItem('token')

    navigate('/login')

  }



  const handleDeleteAccount = async () => {

    if (window.confirm('Are you sure you want to delete your account? This action cannot be undone.')) {

      try {

        const token = localStorage.getItem('music_auth_token')

        const res = await fetch(`${API_BASE}/settings/account`, {

          method: 'DELETE',

          headers: {

            'Authorization': `Bearer ${token}`

          }

        })



        if (!res.ok) {

          const data = await res.json()

          throw new Error(data.detail || 'Failed to delete account')

        }



        localStorage.removeItem('token')

        navigate('/login')

      } catch (err) {

        showMessage('error', err.message || 'Failed to delete account')

      }

    }

  }



  const renderTabContent = () => {

    switch (activeTab) {

      case 'profile':

        return (

          <form onSubmit={handleProfileSave} className="settings-form">

            <div className="form-section">

              <h3>Profile Information</h3>

              <div className="profile-image-upload">

                <div className="current-avatar">

                  {profile.profileImage ? (

                    <img src={profile.profileImage} alt="Profile" />

                  ) : (

                    <i className="fa-solid fa-user"></i>

                  )}

                </div>

                <label className="btn btn-secondary">

                  <i className="fa-solid fa-camera"></i>

                  Change Avatar

                  <input type="file" accept="image/\*" style={{ display: 'none' }} />

                </label>

                <p className="form-hint">JPG, PNG or GIF. Max 5MB.</p>

              </div>



              <div className="form-row">

                <div className="form-group">

                  <label htmlFor="name">Display Name</label>

                  <input

                    type="text"

                    id="name"

                    value={profile.name}

                    onChange={(e) => setProfile(prev => ({ ...prev, name: e.target.value }))}

                    placeholder="Enter your display name"

                  />

                </div>

                <div className="form-group">

                  <label htmlFor="username">Username</label>

                  <input

                    type="text"

                    id="username"

                    value={profile.username}

                    onChange={(e) => setProfile(prev => ({ ...prev, username: e.target.value }))}

                    placeholder="Enter your username"

                  />

                </div>

              </div>



              <div className="form-group">

                <label htmlFor="email">Email Address</label>

                <input

                  type="email"

                  id="email"

                  value={profile.email}

                  onChange={(e) => setProfile(prev => ({ ...prev, email: e.target.value }))}

                  placeholder="Enter your email"

                  disabled

                />

                <p className="form-hint">Email cannot be changed. Contact support to update.</p>

              </div>



              <button type="submit" className="btn btn-primary" disabled={loading}>

                {loading ? 'Saving...' : 'Save Changes'}

              </button>

            </div>

          </form>

        )



      case 'notifications':

        return (

          <form onSubmit={handleNotificationsSave} className="settings-form">

            <div className="form-section">

              <h3>Email Notifications</h3>

              <label className="toggle-label">

                <input

                  type="checkbox"

                  checked={notifications.emailNotifications}

                  onChange={(e) => setNotifications(prev => ({ ...prev, emailNotifications: e.target.checked }))}

                />

                <span className="toggle-slider"></span>

                <div className="toggle-content">

                  <strong>Email Notifications</strong>

                  <p>Receive emails about your account and activity</p>

                </div>

              </label>



              <label className="toggle-label">

                <input

                  type="checkbox"

                  checked={notifications.pushNotifications}

                  onChange={(e) => setNotifications(prev => ({ ...prev, pushNotifications: e.target.checked }))}

                />

                <span className="toggle-slider"></span>

                <div className="toggle-content">

                  <strong>Push Notifications</strong>

                  <p>Receive browser notifications when new music is available</p>

                </div>

              </label>

            </div>



            <div className="form-section">

              <h3>Content Notifications</h3>

              <label className="toggle-label">

                <input

                  type="checkbox"

                  checked={notifications.newReleases}

                  onChange={(e) => setNotifications(prev => ({ ...prev, newReleases: e.target.checked }))}

                />

                <span className="toggle-slider"></span>

                <div className="toggle-content">

                  <strong>New Releases</strong>

                  <p>Get notified when artists you follow release new music</p>

                </div>

              </label>



              <label className="toggle-label">

                <input

                  type="checkbox"

                  checked={notifications.playlistUpdates}

                  onChange={(e) => setNotifications(prev => ({ ...prev, playlistUpdates: e.target.checked }))}

                />

                <span className="toggle-slider"></span>

                <div className="toggle-content">

                  <strong>Playlist Updates</strong>

                  <p>Notifications when your followed playlists are updated</p>

                </div>

              </label>



              <label className="toggle-label">

                <input

                  type="checkbox"

                  checked={notifications.socialActivity}

                  onChange={(e) => setNotifications(prev => ({ ...prev, socialActivity: e.target.checked }))}

                />

                <span className="toggle-slider"></span>

                <div className="toggle-content">

                  <strong>Social Activity</strong>

                  <p>When someone follows you or likes your playlists</p>

                </div>

              </label>

            </div>



            <div className="form-section">

              <h3>Marketing</h3>

              <label className="toggle-label">

                <input

                  type="checkbox"

                  checked={notifications.marketingEmails}

                  onChange={(e) => setNotifications(prev => ({ ...prev, marketingEmails: e.target.checked }))}

                />

                <span className="toggle-slider"></span>

                <div className="toggle-content">

                  <strong>Marketing Emails</strong>

                  <p>Receive updates about new features, tips, and offers</p>

                </div>

              </label>

            </div>



            <button type="submit" className="btn btn-primary" disabled={loading}>

              {loading ? 'Saving...' : 'Save Changes'}

            </button>

          </form>

        )



      case 'playback':

        return (

          <form onSubmit={handlePlaybackSave} className="settings-form">

            <div className="form-section">

              <h3>Playback Options</h3>



              <label className="toggle-label">

                <input

                  type="checkbox"

                  checked={playback.crossfade}

                  onChange={(e) => setPlayback(prev => ({ ...prev, crossfade: e.target.checked }))}

                />

                <span className="toggle-slider"></span>
[]
                <div className="toggle-content">

                  <strong>Crossfade</strong>

                  <p>Overlap songs for smooth transitions</p>

                </div>

              </label>



              <label className="toggle-label">

                <input

                  type="checkbox"

                  checked={playback.gaplessPlayback}

                  onChange={(e) => setPlayback(prev => ({ ...prev, gaplessPlayback: e.target.checked }))}

                />

                <span className="toggle-slider"></span>

                <div className="toggle-content">

                  <strong>Gapless Playback</strong>

                  <p>Play consecutive tracks without silence between them</p>

                </div>

              </label>



              <label className="toggle-label">

                <input

                  type="checkbox"

                  checked={playback.autoPlay}

                  onChange={(e) => setPlayback(prev => ({ ...prev, autoPlay: e.target.checked }))}

                />

                <span className="toggle-slider"></span>

                <div className="toggle-content">

                  <strong>Autoplay</strong>

                  <p>Automatically play similar songs when your music ends</p>

                </div>

              </label>



              <label className="toggle-label">

                <input

                  type="checkbox"

                  checked={playback.normalizeVolume}

                  onChange={(e) => setPlayback(prev => ({ ...prev, normalizeVolume: e.target.checked }))}

                />

                <span className="toggle-slider"></span>

                <div className="toggle-content">

                  <strong>Normalize Volume</strong>

                  <p>Set the same volume level for all songs</p>

                </div>

              </label>

            </div>



            <div className="form-section">




              <h3>Voice Assistant</h3>




              <label className="toggle-label">




                <input



                  type="checkbox"



                  checked={playback.voiceAssistantEnabled}



                  onChange={(e) => handleVoiceAssistantToggle(e.target.checked)}



                />




                <span className="toggle-slider"></span>




                <div className="toggle-content">



                  <strong>Voice Assistant</strong>



                  <p>Enable Leo voice commands to control music playback</p>



                </div>




              </label>




              <div className="voice-command-help" style={{ marginTop: '16px', padding: '14px 16px', borderRadius: '10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <strong>Say “Hey Leo” followed by one command:</strong>
                <ul style={{ margin: '10px 0 0', paddingLeft: '20px', lineHeight: 1.8 }}>
                  <li>“play [song title]”</li>
                  <li>“pause song”</li>
                  <li>“volume up” or “volume down”</li>
                  <li>“mute” or “unmute”</li>
                  <li>“skip song” or “previous song”</li>
                </ul>
                <p className="form-hint" style={{ margin: '10px 0 0' }}>
                  Commands are matched directly; Rasa is no longer required.
                </p>
              </div>




            </div>





            <div className="form-section">

              <h3>Audio Quality</h3>



              <div className="form-group">

                <label htmlFor="streamingQuality">Streaming Quality</label>

                <select

                  id="streamingQuality"

                  value={playback.streamingQuality}

                  onChange={(e) => setPlayback(prev => ({ ...prev, streamingQuality: e.target.value }))}

                >

                  {streamingQualities.map(q => (

                    <option key={q.value} value={q.value}>{q.label}</option>

                  ))}

                </select>

              </div>



              <div className="form-group">

                <label htmlFor="downloadQuality">Download Quality</label>

                <select

                  id="downloadQuality"

                  value={playback.downloadQuality}

                  onChange={(e) => setPlayback(prev => ({ ...prev, downloadQuality: e.target.value }))}

                >

                  {streamingQualities.map(q => (

                    <option key={q.value} value={q.value}>{q.label}</option>

                  ))}

                </select>

              </div>

            </div>



            <button type="submit" className="btn btn-primary" disabled={loading}>

              {loading ? 'Saving...' : 'Save Changes'}

            </button>

          </form>

        )



      case 'account':

        return (

          <div className="settings-form">

            <div className="form-section">

              <h3>Change Password</h3>

              <form onSubmit={handlePasswordChange}>

                <div className="form-group">

                  <label htmlFor="currentPassword">Current Password</label>

                  <input

                    type="password"

                    id="currentPassword"

                    value={account.currentPassword}

                    onChange={(e) => setAccount(prev => ({ ...prev, currentPassword: e.target.value }))}

                    placeholder="Enter current password"

                    required

                  />

                </div>



                <div className="form-group">

                  <label htmlFor="newPassword">New Password</label>

                  <input

                    type="password"

                    id="newPassword"

                    value={account.newPassword}

                    onChange={(e) => setAccount(prev => ({ ...prev, newPassword: e.target.value }))}

                    placeholder="Enter new password (min 8 characters)"

                    required

                    minLength={8}

                  />

                </div>



                <div className="form-group">

                  <label htmlFor="confirmPassword">Confirm New Password</label>

                  <input

                    type="password"

                    id="confirmPassword"

                    value={account.confirmPassword}

                    onChange={(e) => setAccount(prev => ({ ...prev, confirmPassword: e.target.value }))}

                    placeholder="Confirm new password"

                    required

                  />

                </div>



                <button type="submit" className="btn btn-primary" disabled={loading}>

                  {loading ? 'Changing...' : 'Change Password'}

                </button>

              </form>

            </div>



            <div className="form-section danger-zone">

              <h3>Two-Factor Authentication</h3>

              <label className="toggle-label">

                <input

                  type="checkbox"

                  checked={account.twoFactorEnabled}

                  onChange={(e) => setAccount(prev => ({ ...prev, twoFactorEnabled: e.target.checked }))}

                />

                <span className="toggle-slider"></span>

                <div className="toggle-content">

                  <strong>Enable 2FA</strong>

                  <p>Add an extra layer of security to your account</p>

                </div>

              </label>

              <p className="form-hint">Uses authenticator app (Google Authenticator, Authy, etc.)</p>

            </div>



            <div className="form-section danger-zone">

              <h3>Danger Zone</h3>

              <p className="form-hint">Once you delete your account, there is no going back. Please be certain.</p>

              <button

                type="button"

                className="btn btn-danger"

                onClick={handleDeleteAccount}

              >

                <i className="fa-solid fa-trash"></i>

                Delete Account

              </button>

            </div>

          </div>

        )



      case 'preferences':

        return (

          <form onSubmit={handlePreferencesSave} className="settings-form">

            <div className="form-section">

              <h3>Language & Region</h3>



              <div className="form-row">

                <div className="form-group">

                  <label htmlFor="language">Language</label>

                  <select

                    id="language"

                    value={preferences.language}

                    onChange={(e) => setPreferences(prev => ({ ...prev, language: e.target.value }))}

                  >

                    {languages.map(l => (

                      <option key={l.value} value={l.value}>{l.label}</option>

                    ))}

                  </select>

                </div>



                <div className="form-group">

                  <label htmlFor="region">Region</label>

                  <select

                    id="region"

                    value={preferences.region}

                    onChange={(e) => setPreferences(prev => ({ ...prev, region: e.target.value }))}

                  >

                    {regions.map(r => (

                      <option key={r.value} value={r.value}>{r.label}</option>

                    ))}

                  </select>

                </div>

              </div>

            </div>



            <div className="form-section">

              <h3>Appearance</h3>



              <div className="form-group">

                <label>Theme</label>

                <div className="theme-options">

                  {['dark', 'light', 'system'].map(theme => (

                    <label key={theme} className={`theme-option ${preferences.theme === theme ? 'active' : ''}`}>

                      <input

                        type="radio"

                        name="theme"

                        value={theme}

                        checked={preferences.theme === theme}

                        onChange={(e) => setPreferences(prev => ({ ...prev, theme: e.target.value }))}

                      />

                      <span className="theme-option-label">

                        <i className={theme === 'dark' ? 'fa-solid fa-moon' : theme === 'light' ? 'fa-solid fa-sun' : 'fa-solid fa-desktop'}></i>

                        {theme.charAt(0).toUpperCase() + theme.slice(1)}

                      </span>

                    </label>

                  ))}

                </div>

              </div>

            </div>



            <button type="submit" className="btn btn-primary" disabled={loading}>

              {loading ? 'Saving...' : 'Save Changes'}

            </button>

          </form>

        )



      default:

        return null

    }

  }



  return (

    <>

      <nav>

        <div className="left-half">

          <div className="logo">

            <i className="fa-brands fa-itunes-note"></i>

          </div>



          <div className="home">

            <Link to="/">

              <i className="fa-solid fa-house"></i>

            </Link>

          </div>



          <div className="search">

            <div className="search-icon">

              <i className="fa-solid fa-magnifying-glass"></i>

            </div>

            <input

              type="text"

              className="input-box"

              placeholder="Search to listen"

              readOnly

            />

          </div>

        </div>



        <div className="right-half">

          <div className="right-half_pt-1">

            

            <div className="download">

              <i className="fa-solid fa-circle-arrow-down"></i>

              <span>Download</span>

            </div>

          </div>

          <div className="right-half_pt-2">

            <div className="settings-button">

              <i className="fa-solid fa-gear"></i>

            </div>

            {profile.name && (

              <div className="user-menu" style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#fff' }}>

                <span style={{ fontSize: '0.85rem', opacity: 0.8 }}>{profile.name}</span>

                <div className="current-avatar" style={{ width: '36px', height: '36px', border: 'none' }}>

                  {profile.profileImage ? (

                    <img src={profile.profileImage} alt="Profile" style={{ borderRadius: '50%' }} />

                  ) : (

                    <i className="fa-solid fa-user" style={{ fontSize: '1.1rem', color: 'rgba(255,255,255,0.7)' }}></i>

                  )}

                </div>

              </div>

            )}

          </div>

        </div>

      </nav>



      <div className="settings-page">

        <aside className="settings-sidebar">

          <div className="sidebar-header">

            <h2>Settings</h2>

            <p>Manage your account and preferences</p>

          </div>



          <div className="settings-nav">

            <ul>

              {tabs.map(tab => (

                <li key={tab.id}>

                  <button

                    className={`nav-item ${activeTab === tab.id ? 'active' : ''}`}

                    onClick={() => setActiveTab(tab.id)}

                  >

                    <i className={`fa-solid ${tab.icon}`}></i>

                    <span>{tab.label}</span>

                  </button>

                </li>

              ))}

            </ul>

          </div>



          <div className="sidebar-footer">

            <button className="btn btn-outline" onClick={handleLogout}>

              <i className="fa-solid fa-right-from-bracket"></i>

              Logout

            </button>

          </div>

        </aside>



        <main className="settings-main">

          {message.text && (

            <div className={`alert alert-${message.type}`}>

              <i className={message.type === 'success' ? 'fa-solid fa-check-circle' : 'fa-solid fa-exclamation-circle'}></i>

              <span>{message.text}</span>

            </div>

          )}



          <div className="settings-content">

            {renderTabContent()}

          </div>

        </main>

      </div>

    </>

  )

}
