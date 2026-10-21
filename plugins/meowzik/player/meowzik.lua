local utils = require 'mp.utils'

local options = { control = '', run = '' }
require('mp.options').read_options(options, 'meowzik')

local seen = ''
local seek = nil

local function report(kind, value)
  io.stdout:write('@' .. kind .. ' ' .. tostring(value) .. '\n')
  io.stdout:flush()
end

local function follow()
  local file = io.open(options.control, 'r')
  if not file then return end
  local text = file:read('*a')
  file:close()
  if text == seen then return end
  seen = text

  local wanted = utils.parse_json(text)
  if type(wanted) ~= 'table' then return end
  if tostring(wanted.run) ~= options.run then
    mp.command('quit 4')
    return
  end
  if type(wanted.volume) == 'number' then mp.set_property_number('volume', wanted.volume) end
  if type(wanted.pause) == 'boolean' then mp.set_property_bool('pause', wanted.pause) end
  if type(wanted.seek) == 'table' and wanted.seek.id ~= seek then
    if seek ~= nil and type(wanted.seek.to) == 'number' then
      mp.commandv('seek', tostring(wanted.seek.to), 'absolute')
    end
    seek = wanted.seek.id
  end
end

local function tell()
  report('pos', mp.get_property_number('time-pos') or '-')
  report('len', mp.get_property_number('duration') or '-')
end

mp.register_event('playback-restart', function() report('start', '') end)
mp.register_event('end-file', function(event) report('end', tostring(event.reason) .. ' ' .. tostring(event.file_error)) end)
mp.add_periodic_timer(0.1, follow)
mp.add_periodic_timer(0.25, tell)