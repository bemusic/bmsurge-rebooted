require "json"
songlist = JSON.parse(File.read("private/_songlist.json"))
total_duration = songlist.map{|x|x['duration']}.sum
puts "%d songs, %.2f hours" % [songlist.length, total_duration / 3600.0]
puts songlist.map{|x|x['event']}.uniq.sort.join(', ')
puts
puts

fmt_length=->ts{
    tm,s=ts.divmod(60.0)
    h,m=tm.divmod(60.0)
    h > 0 ? ('%d:%02d:%02d' % [h,m,s]) : ('%02d:%02d' % [m,s])
}

description = "
Now playing from <strong>#{songlist.length} tracks</strong>, totaling <strong>#{'%.2f' % [total_duration / 3600.0]} hours</strong>.
<!--
<br><br>

Want to listen to a specific song? You can now request songs!
Please go to the <a href=\"https://bmsurge-music-request.glitch.me\" target=\"_blank\"><strong>song request</strong></a>
page for more details.
-->
<br><br>

Current list of events:
<table style='margin: 0 auto'>
<tr>
<th>event</th>
<th style='text-align:right'>length</th>
</tr>
#{songlist
  .group_by{|x|x['event']}.sort.map {|k,v|"<tr><td>#{k}</td><td style='text-align:right'>#{fmt_length[v.map{|x|x['duration']}.sum]}</td></tr>"}.join("\n")}
</table>

"

puts description

File.write 'private/_description.json', description.to_json