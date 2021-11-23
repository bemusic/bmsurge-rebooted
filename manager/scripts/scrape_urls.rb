# This script will scrape the URLs from the directory listing page at "$SCRIPTS_SCRAPE_URLS_BASE/$1/"
# and write them to a file named "$1.urls.json" in the private directory.

require 'json'

base_url = "#{ENV.fetch('SCRIPTS_SCRAPE_URLS_BASE')}/#{ARGV[0]}/"
puts "Scraping from #{base_url}"

raise "Must provide event ID" if !ARGV[0] || ARGV[0].empty?

data = JSON.pretty_generate(`curl "#{base_url}"`.force_encoding('ISO-8859-1').scan(/href="([^"]+)"/).map(&:first).reject{|x|x == '../'}.map{|x|base_url+x})
puts data

puts ""
puts "Number of songs found: #{JSON.parse(data).length}"
puts "Press enter to continue..."
$stdin.gets

name = "private/#{ARGV[0]}.urls.json"
p name

system "mkdir -p private"
File.write(name, data)

puts "Next: Run this command:"
puts "    node src/index.js import -f #{name}"
